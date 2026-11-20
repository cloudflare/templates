const MODEL_ID = "@cf/black-forest-labs/flux-2-klein-9b";
const PROMPT = "cyberpunk cat";

export default {
	async fetch(_request: Request, env: Env): Promise<Response> {
		let base64: string | undefined;
		try {
			base64 = await generateImage(env);
		} catch (error) {
			// Workers AI rejects some generated images with error 3030. Each call
			// makes a new image, so try once more before giving up.
			if (!isFlaggedOutput(error)) throw error;
			try {
				base64 = await generateImage(env);
			} catch (retryError) {
				if (!isFlaggedOutput(retryError)) throw retryError;
				return new Response(
					"The generated image was flagged. Reload the page to try again.",
					{ status: 503 },
				);
			}
		}

		const image = base64
			? Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
			: undefined;
		const contentType = image && detectImageType(image);
		if (!image || !contentType) {
			return new Response("The model did not return an image", {
				status: 502,
			});
		}

		return new Response(image, {
			headers: {
				"content-type": contentType,
			},
		});
	},
} satisfies ExportedHandler<Env>;

async function generateImage(env: Env): Promise<string | undefined> {
	const form = new FormData();
	form.append("prompt", PROMPT);

	// FLUX.2 models take multipart form data. Serializing the form through a
	// Response produces the body stream and the Content-Type with its boundary.
	const formResponse = new Response(form);

	const response = await env.AI.run(MODEL_ID, {
		multipart: {
			body: formResponse.body!,
			contentType: formResponse.headers.get("content-type")!,
		},
	});
	return response.image;
}

function isFlaggedOutput(error: unknown): boolean {
	return error instanceof Error && error.message.startsWith("3030:");
}

function detectImageType(bytes: Uint8Array): string | undefined {
	if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
		return "image/jpeg";
	}
	if (
		[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
			(b, i) => bytes[i] === b,
		)
	) {
		return "image/png";
	}
	return undefined;
}
