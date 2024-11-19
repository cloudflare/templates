export default {
  async fetch(request, env) {
    const batchedInput = {
      text: ["Tell me a joke about Cloudflare", "The weather is sunny"],
    };
    const batchedResponse = await env.AI.run(
      "@cf/baai/bge-base-en-v1.5",
      batchedInput,
    );
    const input = {
      text: "Tell me a joke about Cloudflare",
    };
    const response = await env.AI.run("@cf/baai/bge-base-en-v1.5", input);
    return Response.json({ batchedInput, batchedResponse, input, response });
  },
} satisfies ExportedHandler<Env>;
