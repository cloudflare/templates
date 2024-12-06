import {
  type Connection,
  Server,
  type WSMessage,
  routePartykitRequest,
} from "partyserver";
import { nanoid } from "nanoid";
import { EventSourceParserStream } from "eventsource-parser/stream";

import type { ChatMessage, Message } from "../shared";

export class Chat extends Server<Env> {
  static options = { hibernate: true };

  messages = [] as ChatMessage[];

  broadcastMessage(message: Message, exclude?: string[]) {
    this.broadcast(JSON.stringify(message), exclude);
  }

  onStart() {
    // this is where you can initialize things that need to be done before the server starts
    // for example, load previous messages from a database or a service

    // create the messages table if it doesn't exist
    this.ctx.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, user TEXT, role TEXT, content TEXT)`,
    );

    // load the messages from the database
    this.messages = this.ctx.storage.sql
      .exec(`SELECT * FROM messages`)
      .toArray() as ChatMessage[];
  }

  onConnect(connection: Connection) {
    connection.send(
      JSON.stringify({
        type: "all",
        messages: this.messages,
      } satisfies Message),
    );
  }

  saveMessage(message: ChatMessage) {
    // check if the message already exists
    const existingMessage = this.messages.find((m) => m.id === message.id);
    if (existingMessage) {
      this.messages = this.messages.map((m) => {
        if (m.id === message.id) {
          return message;
        }
        return m;
      });
    } else {
      this.messages.push(message);
    }

    this.ctx.storage.sql.exec(
      `INSERT INTO messages (id, user, role, content) VALUES ('${
        message.id
      }', '${message.user}', '${message.role}', ${JSON.stringify(
        message.content,
      )}) ON CONFLICT (id) DO UPDATE SET content = ${JSON.stringify(
        message.content,
      )}`,
    );
  }

  async onMessage(connection: Connection, message: WSMessage) {
    // let's broadcast the raw message to everyone else
    this.broadcast(message);

    // let's update our local messages store
    const parsed = JSON.parse(message as string) as Message;

    if (parsed.type === "add") {
      // add the message to the local store
      this.saveMessage(parsed);
      // let's ask AI to respond as well for fun
      const aiMessage = {
        id: nanoid(8),
        content: "...",
        user: "AI",
        role: "assistant",
      } as const;

      this.broadcastMessage({
        type: "add",
        ...aiMessage,
      });

      const aiMessageStream = (await this.env.AI.run(
        "@cf/meta/llama-2-7b-chat-int8",
        {
          stream: true,
          messages: this.messages.map((m) => ({
            content: m.content,
            role: m.role,
          })),
        },
      )) as ReadableStream;

      this.saveMessage(aiMessage);

      const eventStream = aiMessageStream
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(new EventSourceParserStream());

      // We want the AI to respond to the message in real-time
      // so we're going to stream every chunk as an "update" message

      let buffer = "";

      for await (const event of eventStream) {
        if (event.data !== "[DONE]") {
          // let's append the response to the buffer
          const data = JSON.parse(event.data) as { response: string };
          buffer += data.response;
          // and broadcast the buffer as an update
          this.broadcastMessage({
            type: "update",
            ...aiMessage,
            content: buffer + "...", // let's add an ellipsis to show it's still typing
          });
        } else {
          // the AI is done responding
          // we update our local messages store with the final response
          this.saveMessage({
            ...aiMessage,
            content: buffer,
          });

          // let's update the message with the final response
          this.broadcastMessage({
            type: "update",
            ...aiMessage,
            content: buffer,
          });
        }
      }
    } else if (parsed.type === "update") {
      // update the message in the local store
      this.saveMessage(parsed);
    }
  }
}

export default {
  async fetch(request, env) {
    return (
      (await routePartykitRequest(request, { ...env })) ||
      env.ASSETS.fetch(request)
    );
  },
} satisfies ExportedHandler<Env>;
