import type { StreamingWrapper } from "./stream-wrapper";
import type { ResultBatch, MessageResponse } from "./types";
import { MODEL } from "../config";

export const summarize = ({
	query,
	answers,
	ai,
}: {
	query: string;
	answers: ResultBatch["results"];
	ai: Ai;
}) => {
	try {
		// @ts-ignore
		return ai.run(MODEL, {
			stream: true,
			messages: [
				{
					role: "user",
					content: `	You are a helpful AI assistant specialized in answering questions using retrieved list of results. 
								Your task is to provide accurate, relevant answers based on the matched content provided.
								You will receive a user question and a set of results relevant to this query.

								You should:
								1. Analyze the relevance of matched results
								2. Synthesize information from multiple sources when applicable
								3. Acknowledge if the available results don't fully answer the query
								4. Format the response in a way that maximizes readability, in Markdown format

								Answer only with direct reply to the user question, be concise, omit everything which is not directly relevant, focus on answering the question directly and do not redirect the user to read the content. 

								If the available results don't contain enough information to fully answer the query, explicitly state this and provide an answer based on what is available.

								Important:
								- your answer should reference results along side key pieces of information
								- when referencing document(s) make sure to include a link to the document
								- Present information in order of relevance 
								- If results contradict each other, note this and explain your reasoning for the chosen answer
								- Do not repeat the instructions
								- the answer should be in text format, avoid markdown for the answer

								The user's question is: ${query}. 
								The items are: ${JSON.stringify(answers)}.`,
				},
			],
		});
	} catch (e) {
		throw new Error(`${MODEL}: ${(e as Error).message}`);
	}
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
	const aiStream = await summarize({
		query,
		answers,
		ai,
	});

	const reader = aiStream.getReader();
	const decoder = new TextDecoder();
	let buffer: any = "";

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split("\n");
		buffer = lines.pop(); // Keep last line as it may be incomplete

		for (const line of lines) {
			if (line.startsWith("data: ")) {
				try {
					const data = JSON.parse(line.slice(6));
					if (data.response) {
						await stream?.writeStream({
							message_type: "summary",
							message: data.response,
							query_id: "",
						} satisfies MessageResponse);
					}
				} catch (e) {}
			}
		}
	}

	// Process any remaining buffer
	if (buffer.startsWith("data: ")) {
		try {
			const data = JSON.parse(buffer.slice(6));
			if (data.response) {
				await stream?.writeStream({
					message_type: "summary",
					message: data.response,
					query_id: "",
				} satisfies MessageResponse);
			}
		} catch (e) {
			console.warn("Error parsing final buffer:", e);
		}
	}

	try {
	} catch (error) {
		await stream?.writeStream({
			message_type: "error",
			message: (error as Error).message,
		});
		await stream?.writeStream({
			message_type: "summary",
			message: (error as Error).message,
			query_id: "",
		});
		console.error((error as Error).message);
	}
};
