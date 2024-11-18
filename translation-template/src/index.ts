export default {
  async fetch(request, env) {
    const inputs = {
      text: "Tell me a joke about Cloudflare",
      source_lang: "en",
      target_lang: "fr",
    };
    const response = await env.AI.run("@cf/meta/m2m100-1.2b", inputs);

    return Response.json({ inputs, response });
  },
} satisfies ExportedHandler<Env>;
