import { createAdapter } from "@agentskit/adapters/createAdapter";
import type { AdapterRequest, StreamChunk } from "@agentskit/core";

export const MODEL_ID = "@cf/meta/llama-3.1-8b-instruct-fp8";

interface WorkersAIEvent {
	response?: string;
	error?: string;
}

export function createWorkersAIAdapter(ai: Ai) {
	return createAdapter({
		send: async (request: AdapterRequest) => {
			const result = await ai.run(MODEL_ID, {
				messages: request.messages.map(({ role, content }) => ({
					role: role === "tool" ? "user" : role,
					content,
				})),
				max_tokens: request.context?.maxTokens ?? 768,
				stream: true,
			});

			if (!(result instanceof ReadableStream)) {
				throw new Error("Workers AI did not return a stream");
			}

			return result;
		},
		parse: parseWorkersAIStream,
	});
}

export async function* parseWorkersAIStream(
	stream: ReadableStream,
): AsyncIterableIterator<StreamChunk> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	try {
		while (true) {
			const { done, value } = await reader.read();
			buffer += decoder.decode(value, { stream: !done });
			const lines = buffer.split("\n");
			buffer = done ? "" : (lines.pop() ?? "");

			for (const line of lines) {
				const data = line.startsWith("data:") ? line.slice(5).trim() : "";
				if (!data || data === "[DONE]") continue;

				const event = JSON.parse(data) as WorkersAIEvent;
				if (event.error) throw new Error(event.error);
				if (event.response) yield { type: "text", content: event.response };
			}

			if (done) break;
		}
	} finally {
		reader.releaseLock();
	}

	yield { type: "done" };
}
