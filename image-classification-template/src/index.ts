export default {
  async fetch(request, env) {
    const imageResponse = await fetch("https://cataas.com/cat");
    const blob = await imageResponse.arrayBuffer();

    const inputs = {
      image: [...new Uint8Array(blob)],
    };

    const response = await env.AI.run("@cf/microsoft/resnet-50", inputs);
    return Response.json({ inputs: { image: [] }, response });
  },
} satisfies ExportedHandler<Env>;
