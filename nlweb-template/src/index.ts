import { handleAsk } from "./ask";
import { NLWebMcp } from "./nlweb-mcp-do";

async function getNlWebResponse(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
) {
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
