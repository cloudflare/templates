import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { handleDefault } from "./ask";

export class NLWebMcp extends McpAgent<Env> {
  server = new McpServer({ name: "Demo", version: "1.0.0" });

  async init() {
    console.log("props:", this.props);
    console.log(JSON.stringify(this.props));
    this.server.tool(
      "ask",
      {
        query: z.string(),
        // sites: z.array(z.string()).optional(),
        generate_mode: z
          .enum(["list", "summarize", "generate", "none"])
          .optional()
          .default("list"),
      },
      async ({ query, generate_mode }) => {
        if (!this.props.ragId || typeof this.props.ragId !== "string") {
          return {
            content: [{ type: "text", text: "Missing rag id" }],
            isError: true,
          };
        }

        const res = await handleDefault(
          this.env.AI.autorag(this.props.ragId),
          { query, generate_mode },
          this.env,
        );
        const parsed = await res.json();

        if (res.status === 400) {
          return {
            content: [{ type: "text", text: JSON.stringify(parsed) }],
            isError: true,
          };
        }
        return {
          content: [{ type: "text", text: JSON.stringify(parsed) }],
        };
      },
    );
  }
}
