export default {
  async fetch(request, env) {
    // prompt - simple completion style input
    const simple = {
      prompt: "Tell me a joke about Cloudflare",
    };
    const response = await env.AI.run("@cf/meta/llama-3-8b-instruct", simple);

    return Response.json({ inputs: simple, response });
  },
} satisfies ExportedHandler<Env>;
