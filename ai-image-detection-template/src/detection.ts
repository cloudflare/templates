import { HttpError } from "./errors";
import { ModelResultSchema, type Mode, type ModelResult } from "./schema";

export const MODEL = "@cf/images/ai-image-detection";

export type DetectionEnv = {
	AI: {
		run(
			model: typeof MODEL,
			input: { image: string; mode: Mode },
		): Promise<unknown>;
	};
};

// Encodes in chunks to avoid a stack overflow on large images.
function toBase64(bytes: ArrayBuffer): string {
	const data = new Uint8Array(bytes);
	let binary = "";
	const chunkSize = 0x8000;
	for (let offset = 0; offset < data.length; offset += chunkSize) {
		binary += String.fromCharCode(...data.subarray(offset, offset + chunkSize));
	}
	return btoa(binary);
}

function unwrapModelResponse(value: unknown): unknown {
	let current = value;
	for (let depth = 0; depth < 5; depth += 1) {
		if (typeof current === "string") {
			try {
				current = JSON.parse(current);
			} catch {
				return undefined;
			}
		}
		if (!current || typeof current !== "object") return current;
		const object = current as Record<string, unknown>;
		if (object.output && typeof object.output === "object") {
			current = object.output;
		} else if (object.result && typeof object.result === "object") {
			current = object.result;
		} else {
			return current;
		}
	}
	return undefined;
}

export async function detectImage(
	env: DetectionEnv,
	bytes: ArrayBuffer,
	contentType: string,
	mode: Mode,
): Promise<ModelResult> {
	const image = `data:${contentType};base64,${toBase64(bytes)}`;
	const raw = await env.AI.run(MODEL, { image, mode });
	const parsed = ModelResultSchema.safeParse(unwrapModelResponse(raw));
	if (!parsed.success) {
		throw new HttpError(502, "the model returned an unexpected response");
	}
	if (parsed.data.mode !== mode)
		throw new HttpError(502, "the model returned an unexpected response");
	return parsed.data;
}
