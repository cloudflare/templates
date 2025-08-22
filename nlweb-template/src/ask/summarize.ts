import type { StreamingWrapper } from "./stream-wrapper";
import type { ResultBatch, MessageResponse } from "./types";

export const summarize = async ({
  query,
  answers,
  ai,
}: {
  query: string;
  answers: ResultBatch["results"];
  ai: Ai;
}) => {
  const response = await ai.run("@cf/openai/gpt-oss-20b", {
    input: `
                Given the following items, summarize the results as an answer to the user's question. 
                The user's question is: ${query}. 
                The items are: ${JSON.stringify(answers)}.`,
  });

  const summary = response.output.at(-1)?.content[0]?.text as string;

  return summary;
};

export const summarizeStreaming = async ({
  query,
  answers,
  stream,
  ai,
}: {
  query: string;
  answers: ResultBatch["results"];
  stream?: StreamingWrapper;
  ai: Ai;
}) => {
  try {
    const summary = await summarize({
      query,
      answers,
      ai,
    });

    stream?.writeStream({
      message_type: "summary",
      message: summary,
      query_id: "",
    } satisfies MessageResponse);
  } catch (error) {
    stream?.writeStream({
      message_type: "error",
      message: (error as Error).message,
    });
    console.error((error as Error).message);
  }
};
