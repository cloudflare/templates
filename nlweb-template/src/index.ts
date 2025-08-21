import { handleAsk } from "./ask";
import { NLWebMcp } from "./nlweb-mcp-do";

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		if (url.pathname === "/ask") {
			return handleAsk(request, env, env.RAG_ID, ctx);
		}

		if (url.pathname === "/mcp") {
			return NLWebMcp.serve("/mcp").fetch(request, env, {
				...ctx,
				props: {
					ragId: env.RAG_ID,
				},
			});
		}

		if (url.pathname === "/sites") {
			const url = new URL(request.url);
			return Response.json({
				"message-type": "sites",
				sites: [url.hostname],
			});
		}
		if (url.pathname === "/") {
      const response = await env.ASSETS.fetch(request)
      response.headers.set('Access-Control-Allow-Origin', '*');
      response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS")
      response.headers.set(	"Access-Control-Allow-Headers", "Content-Type")
			return response;
		}

		return new Response("Not Found!", {
			status: 404,
		});
	},
} satisfies ExportedHandler<Env>;

export { NLWebMcp };
