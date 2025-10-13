import type { MessageResponse } from "./types";

export class StreamingWrapper {
	private writer: WritableStreamDefaultWriter<Uint8Array>;
	private encoder: TextEncoder;

	constructor(writable: WritableStream<Uint8Array>) {
		this.writer = writable.getWriter();
		this.encoder = new TextEncoder();
	}

	/**
	 * Writes a JSON object to the SSE stream.
	 * @param data The JSON data to send.
	 */
	async writeStream(data: MessageResponse): Promise<void> {
		const sseFormattedString = `data: ${JSON.stringify(data)}\n\n`;
		await this.writer.write(this.encoder.encode(sseFormattedString));
	}
	/**
	 * Closes the stream.
	 */
	async close(): Promise<void> {
		await this.writer.close();
	}
}
