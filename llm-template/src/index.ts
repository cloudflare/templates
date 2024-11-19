export default {
  async fetch(request, env) {
    // prompt - simple completion style input
    let simple = {
      prompt: "Tell me a joke about Cloudflare",
    };
    let response = await env.AI.run("@cf/meta/llama-3-8b-instruct", simple);

    return Response.json({ inputs: simple, response });
  },
} satisfies ExportedHandler<Env>;
