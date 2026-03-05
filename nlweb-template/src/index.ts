import { handleAsk } from "./ask";
import { NLWebMcp } from "./nlweb-mcp-do";

const RATE_LIMITED_ROUTES = new Set(["/ask", "/mcp"]);

async function getNlWebResponse(
	request: Request,
	env: Env,
	ctx: ExecutionContext,
) {
	const url = new URL(request.url);

	if (RATE_LIMITED_ROUTES.has(url.pathname)) {
		const clientIP = request.headers.get("CF-Connecting-IP");
		const rateLimitKey = `rate-limit-${clientIP}`;

		const { success } = await env.RATE_LIMITER.limit({ key: rateLimitKey });
		if (!success) {
			return new Response("Rate limit exceeded", { status: 429 });
		}
	}

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

	if (url.pathname === "/version") {
		return Response.json({
			version: "1.0.0",
		});
	}

	if (url.pathname === "/sites") {
		const url = new URL(request.url);
		return Response.json({
			"message-type": "sites",
			sites: [url.hostname],
		});
	}

	return env.ASSETS.fetch(request);
}

export default {
	async fetch(request, env, ctx) {
		const response = await getNlWebResponse(request, env, ctx);

		const newResponse = new Response(response.body, response);
		newResponse.headers.set("Access-Control-Allow-Origin", "*");
		newResponse.headers.set(
			"Access-Control-Allow-Methods",
			"GET, POST, OPTIONS",
		);
		newResponse.headers.set(
			"Access-Control-Allow-Headers",
			"Content-Type, mcp-session-id, mcp-protocol-version",
		);
		newResponse.headers.set(
			"Access-Control-Expose-Headers",
			"Content-Type, mcp-session-id, mcp-protocol-version",
		);
		return newResponse;
	},
} satisfies ExportedHandler<Env>;

export { NLWebMcp };
