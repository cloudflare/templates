import { handleAsk } from "./ask";
import { NLWebMcp } from "./nlweb-mcp-do";


const ragId = 'web-dev-docs'

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/ask") {
        console.log('here')
      return handleAsk(request, env, ragId)
    }

    if (url.pathname === "/mcp") {
      return NLWebMcp.serve('/mcp').fetch(request, env, { ...ctx, props: {
        ragId
      }});
    }


    if (url.pathname === "/") {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found!', {
        status: 404
    })
  },
} satisfies ExportedHandler<Env>;


export { NLWebMcp }
