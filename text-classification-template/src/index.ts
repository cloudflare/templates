export default {
  async fetch(request, env) {
    const inputs = {
      // text: "I don't like you. I hate you",
      text: "I like you. I love you",
    };

    const response = await env.AI.run(
      "@cf/huggingface/distilbert-sst-2-int8",
      inputs,
    );

    return Response.json({ inputs, response });
  },
} satisfies ExportedHandler<Env>;
