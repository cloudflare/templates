import type { StreamingWrapper } from "./stream-wrapper";
import type { MessageResponse } from "./types";
import { MODEL } from "../config";

export const decontextualize = async ({
	query,
	prev = [],
	ai,
}: {
	query: string;
	prev?: string[];
	ai: Ai;
}) => {
	if (prev.length === 0) return query;

	let response: any;
	try {
		response = await ai.run(MODEL, {
			messages: [
				{
					role: "user",
					content: `
									The user is querying the site {request.site} which has {site.itemType}s.
									Rewrite the query, incorporating the context of the previous queries and answers.
									Keep the decontextualized query short and do not reference the site. 
	
									If the query very clearly does not reference earlier queries, 
									don't change the query. Err on the side of incorporating the context of the 
									previous queries. If you are not sure whether this is a brand new query, 
									or follow up, it is likely a follow up. Try your best to incorporate the 
									context from the previous queries.
	
									The user's query is: ${query}. 
									Previous queries were: ${prev}.`,
				},
			],
		});
	} catch (e) {
		throw new Error(`${MODEL}: ${(e as Error).message}`);
	}

	return response.response;
};

export const decontextualizeStreaming = async ({
	query,
	prev = [],
	ai,
	stream,
}: {
	query: string;
	prev?: string[];
	ai: Ai;
	stream?: StreamingWrapper;
}) => {
	if (prev.length === 0) return query;
	try {
		const newQuery = await decontextualize({
			query,
			prev,
			ai,
		});

		if (newQuery) {
			if (stream) {
				await stream.writeStream({
					message_type: "decontextualized_query",
					decontextualized_query: newQuery,
					original_query: query,
					query_id: "",
				} satisfies MessageResponse);
			}

			return newQuery;
		}
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
		console.error(error);
	}

	return query;
};
