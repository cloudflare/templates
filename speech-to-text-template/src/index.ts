export default {
  async fetch(request, env) {
    const audioResponse = await fetch(
      "https://github.com/Azure-Samples/cognitive-services-speech-sdk/raw/master/samples/cpp/windows/console/samples/enrollment_audio_katie.wav",
    );
    const blob = await audioResponse.arrayBuffer();

    const inputs = {
      audio: [...new Uint8Array(blob)],
    };
    // @ts-expect-error Types for Workers AI are currently broken
    const response = await env.AI.run("@cf/openai/whisper", inputs);

    return Response.json({ inputs, response });
  },
} satisfies ExportedHandler<Env>;
