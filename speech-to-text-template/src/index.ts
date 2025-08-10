export default {
	async fetch(request, env, ctx): Promise<Response> {
		const audioResponse = await fetch(
			"https://github.com/Azure-Samples/cognitive-services-speech-sdk/raw/master/samples/cpp/windows/console/samples/enrollment_audio_katie.wav",
		);
		const blob = await audioResponse.arrayBuffer();

		const inputs = {
			audio: [...new Uint8Array(blob)],
		};
		const response = await env.AI.run("@cf/openai/whisper", inputs);

		return Response.json({ inputs, response });
	},
} satisfies ExportedHandler<Env>;
