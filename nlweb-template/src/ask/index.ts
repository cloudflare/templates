import markdown from "markdown-to-text";
import { decontextualize, decontextualizeStreaming } from "./decontextualize";
import { StreamingWrapper } from "./stream-wrapper";
import type { ResultBatch, MessageResponse, Params } from "./types";
import { summarize, summarizeStreaming } from "./summarize";

// mode : list, summarize, generate, none
export const handleAsk = async (
	request: Request,
	env: Env,
	ragId: string,
	ctx: ExecutionContext,
) => {
	const url = new URL(request.url);
	let params = Object.fromEntries(url.searchParams) as Params;

	if (request.method === "POST") {
		try {
			const contentType = request.headers.get("content-type") || "";
			if (contentType.includes("application/json")) {
				const bodyData = await request.json();
				params = bodyData as Params;
			} else if (contentType.includes("application/x-www-form-urlencoded")) {
				const formData = await request.formData();
				params = Object.fromEntries(formData) as Params;
			}
		} catch (e) {
			console.warn(`Failed to parse POST body: ${(e as Error).message}`);
		}
	}

	const rag = env.AI.autorag(ragId);

	if (
		params.streaming !== "false" ||
		request.headers.get("accept") === "text/event-stream"
	) {
		return handleStreaming(rag, params, env, ctx);
	}

	return await handleDefault(rag, params, env);
};

const joinChunks = (
	item: Awaited<ReturnType<AutoRAG["search"]>>["data"][0],
) => {
	return item.content.reduce((acc, curr) => {
		return acc + curr.text;
	}, " ");
};

export const handleDefault = async (rag: AutoRAG, params: Params, env: Env) => {
	if (params.query) {
		const decontextualizedQuery = await decontextualize({
			query: params.query,
			prev: params.prev,
			ai: env.AI,
		});

		const res = await rag.search({
			query: decontextualizedQuery as string,
		});

		const results = res.data.map((item) => ({
			name: item.filename,
			url: item.filename,
			site: item.filename,
			siteUrl: item.filename,
			score: item.score,
			description: markdown(joinChunks(item))
				.replaceAll(/[\r\n]{2,}/g, "")
				.substring(0, 420),
		}));

		return Response.json({
			api_version: "0.0.1",
			license: {
				message:
					"This data is provided under MIT License. See https://opensource.org/license/mit for details.",
			},
			data_retention: {
				message: "Data provided may be retained for up to 1 day.",
			},
			results,
			...((params.generate_mode === "summarize" && {
				summary: {
					message: await summarize({
						query: params.query,
						answers: results,
						ai: env.AI,
					}),
				},
			}) ||
				{}),
		});
	}

	return Response.json(
		{
			message_type: "error",
			message: "No query provided",
		} satisfies MessageResponse,
		{
			status: 400,
		},
	);
};

const handleStreaming = async (
	rag: AutoRAG,
	params: Params,
	env: Env,
	ctx: ExecutionContext,
) => {
	const { readable, writable } = new TransformStream();
	const wrapper = new StreamingWrapper(writable);

	const streamLogic = async () => {
		try {
			// Your commented-out startup messages can go here
			// await wrapper.writeStream({ message_type: 'api_version', ... });

			await wrapper.writeStream({
				message_type: "api_version",
				api_version: "0.0.1",
			});
			// await wrapper.writeStream({
			// 	message_type: "license",
			// 	content:
			// 		"This data is provided under MIT License. See https://opensource.org/license/mit for details.",
			// });

			await wrapper.writeStream({
				message_type: "data_retention",
				content: "Data provided may be retained for up to 1 day.",
			});

			if (params.query) {
				const decontextualizedQuery = await decontextualizeStreaming({
					query: params.query,
					prev: params.prev,
					ai: env.AI,
					stream: wrapper,
				});

				try {
					const res = await rag.search({
						query: decontextualizedQuery,
					});

					const result: ResultBatch = {
						message_type: "result_batch",
						results: res.data.map((item) => ({
							name: item.filename,
							url: item.filename,
							site: item.filename,
							siteUrl: item.filename,
							score: item.score,
							description: markdown(joinChunks(item))
								.replaceAll("\n", " ")
								.substring(0, 420),
							schema_object: {
								"@context": "http://schema.org/",
								"@type": "ProductGroup",
								"@id": "#social-preview",
								name: item.attributes?.file?.title || "Social Preview",
								brand: {
									"@type": "Brand",
									name: "Cloudflare",
								},
								description:
									item.attributes?.file?.description ||
									markdown(joinChunks(item))
										.replaceAll("\n", " ")
										.substring(0, 420),
								image: item.attributes?.file?.image,
							},
						})),
					};

					if (params.generate_mode === "summarize") {
						await summarizeStreaming({
							query: params.query,
							ai: env.AI,
							stream: wrapper,
							answers: result.results,
						});
					}

					await wrapper.writeStream(result);
				} catch (error) {
					await wrapper.writeStream({
						message_type: "error",
						message:
							(error as Error).message || "An unexpected error occurred.",
					});
					await wrapper.writeStream({
						message_type: "summary",
						message:
							(error as Error).message || "An unexpected error occurred.",
						query_id: "",
					});
				}

				// You can add other messages here, like a summary if needed.
			} else {
				// Handle the case where no query is provided
				await wrapper.writeStream({
					message_type: "error",
					message: "No query provided",
				} satisfies MessageResponse);
			}

			// Signal that the stream is complete
			await wrapper.writeStream({
				message_type: "complete",
			});
		} catch (error: any) {
			console.error("Error during streaming:", error);
			// In case of an error, write an error message to the stream
			await wrapper.writeStream({
				message_type: "error",
				message: error.message || "An unexpected error occurred.",
			});
			await wrapper.writeStream({
				message_type: "summary",
				message: error.message || "An unexpected error occurred.",
				query_id: "",
			});
		} finally {
			// CRITICAL: Always close the writer to end the stream.
			await wrapper.close();
		}
	};

	// Tell the Cloudflare runtime to wait for the streaming logic to complete.
	ctx.waitUntil(streamLogic());

	return new Response(readable, {
		status: 200,
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	});
};
