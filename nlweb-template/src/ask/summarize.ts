import type { StreamingWrapper } from "./stream-wrapper";
import type { ResultBatch, MessageResponse } from "./types";
import { MODEL } from "../config";

export const summarize = async ({
	query,
	answers,
	ai,
}: {
	query: string;
	answers: ResultBatch["results"];
	ai: Ai;
}) => {
	let response: any
	try {
		response = await ai.run(MODEL, {
			messages: [
				{
					role: "user",
					content: `
										Given the following items, summarize the results as an answer to the user's question. 
										The user's question is: ${query}. 
										The items are: ${JSON.stringify(answers)}.`,
				},
			]
    });
  } catch (e) {
		throw new Error(`${MODEL}: ${(e as Error).message}`)
	}

	return response.response;
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
        })

		await stream?.writeStream({
			message_type: "summary",
			message: summary,
			query_id: "",
		} satisfies MessageResponse);
	} catch (error) {
		await stream?.writeStream({
				message_type: "error",
				message: (error as Error).message
		})
		await stream?.writeStream({
			message_type: "summary",
			message: (error as Error).message,
			query_id: "",
		})
		console.error((error as Error).message);
	}
};
