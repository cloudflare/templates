export const modelBaseUrl = "https://model.internal/v1";

// Bound model request bodies before buffering them for JSON parsing.
export async function readText(
	stream: ReadableStream<Uint8Array> | null,
	limit: number,
): Promise<string> {
	if (!stream) return "";
	let bytes = 0;
	let text = "";
	const decoder = new TextDecoder();
	for await (const chunk of stream) {
		bytes += chunk.byteLength;
		if (bytes > limit) throw new Error(`Output exceeds ${limit} bytes`);
		text += decoder.decode(chunk, { stream: true });
	}
	return text + decoder.decode();
}
