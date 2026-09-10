import { Hono } from "hono";
import { corsFromEnv } from "./cors";
import { detectImage, MODEL, type DetectionEnv } from "./detection";
import { HttpError } from "./errors";
import {
	AnalyzeUploadQuery,
	CreateUploadRequest,
	DetectionResultSchema,
	ListImagesQuery,
	ModeSchema,
	type DetectionResult,
	type ErrorResponse,
	type UploadMetadata,
} from "./schema";

type Env = DetectionEnv & {
	IMAGES: ImagesBinding;
	ALLOWED_ORIGINS: string;
	UPLOAD_EXPIRES_IN: number;
	REQUIRE_SIGNED_URLS: boolean;
	MAX_IMAGE_BYTES: number;
};

const CREATOR = "ai-image-detection-uploads-template";

const IMAGE_SIGNATURES: {
	type: string;
	test: (bytes: Uint8Array) => boolean;
}[] = [
	{
		type: "image/jpeg",
		test: (b) =>
			b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
	},
	{
		type: "image/png",
		test: (b) =>
			b.length >= 8 &&
			[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
				(byte, i) => b[i] === byte,
			),
	},
	{
		type: "image/gif",
		test: (b) =>
			b.length >= 6 &&
			b[0] === 0x47 &&
			b[1] === 0x49 &&
			b[2] === 0x46 &&
			b[3] === 0x38 &&
			(b[4] === 0x37 || b[4] === 0x39) &&
			b[5] === 0x61,
	},
	{
		type: "image/webp",
		test: (b) =>
			b.length >= 12 &&
			b[0] === 0x52 &&
			b[1] === 0x49 &&
			b[2] === 0x46 &&
			b[3] === 0x46 &&
			b[8] === 0x57 &&
			b[9] === 0x45 &&
			b[10] === 0x42 &&
			b[11] === 0x50,
	},
];

const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => corsFromEnv(c.env.ALLOWED_ORIGINS)(c, next));

app.post("/uploads", async (c) => {
	validateConfig(c.env);
	const body = await c.req.json().catch(() => null);
	const parsed = CreateUploadRequest.safeParse(body);
	if (!parsed.success) {
		return c.json<ErrorResponse>(
			{ error: parsed.error.issues[0]?.message ?? "invalid request body" },
			400,
		);
	}

	const mode = parsed.data.mode;
	const metadata: UploadMetadata = { status: "pending", mode };
	try {
		const upload = await c.env.IMAGES.hosted.createDirectUpload({
			creator: CREATOR,
			metadata,
			requireSignedURLs: c.env.REQUIRE_SIGNED_URLS,
			expiresIn: c.env.UPLOAD_EXPIRES_IN,
		});
		return c.json({ id: upload.id, upload_url: upload.uploadURL }, 201);
	} catch (error) {
		console.error("Could not create an Images upload", error);
		throw new HttpError(502, "could not create an upload");
	}
});

app.get("/uploads/:id", async (c) => {
	const details = await getOwnedImage(c.env, c.req.param("id"));
	if (!details) return c.json<ErrorResponse>({ error: "image not found" }, 404);
	return c.json(details.meta ?? { status: "pending" }, 200, {
		"cache-control": "no-store",
	});
});

app.post("/uploads/:id/analyze", async (c) => {
	validateConfig(c.env);
	const query = AnalyzeUploadQuery.safeParse(c.req.query());
	if (!query.success) {
		return c.json<ErrorResponse>(
			{ error: query.error.issues[0]?.message ?? "invalid query" },
			400,
		);
	}

	const id = c.req.param("id");
	const details = await getOwnedImage(c.env, id);
	if (!details) return c.json<ErrorResponse>({ error: "image not found" }, 404);
	if (details.draft)
		return c.json<ErrorResponse>(
			{ error: "image has not finished uploading yet" },
			409,
		);

	const existing = asRecord(details.meta);
	const storedMode = ModeSchema.safeParse(existing.mode);
	const mode = query.data.mode ?? (storedMode.success ? storedMode.data : undefined);
	if (
		existing.status === "complete" &&
		storedMode.success &&
		storedMode.data === mode
	) {
		const cached = DetectionResultSchema.safeParse(existing.ai_detection);
		if (cached.success)
			return c.json(cached.data, 200, { "cache-control": "no-store" });
	}

	const stream = await c.env.IMAGES.hosted.image(id).bytes();
	if (!stream) return c.json<ErrorResponse>({ error: "image not found" }, 404);
	const bytes = await readImage(stream, c.env.MAX_IMAGE_BYTES);
	const contentType = IMAGE_SIGNATURES.find((candidate) =>
		candidate.test(new Uint8Array(bytes)),
	)?.type;
	if (!contentType)
		throw new HttpError(415, "image must be jpeg, png, gif, or webp");

	const detection = await detectImage(c.env, bytes, contentType, mode);
	const result: DetectionResult = {
		detection: { model: MODEL, ...detection },
		source: {
			image_id: id,
			filename: details.filename ?? null,
			content_type: contentType,
			bytes: bytes.byteLength,
		},
	};

	await c.env.IMAGES.hosted.image(id).update({
		metadata: {
			...existing,
			status: "complete",
			mode: detection.mode,
			ai_detection: result,
		},
	});
	return c.json(result, 200, { "cache-control": "no-store" });
});

app.get("/images", async (c) => {
	const query = ListImagesQuery.safeParse(c.req.query());
	if (!query.success) {
		return c.json<ErrorResponse>(
			{ error: query.error.issues[0]?.message ?? "invalid query" },
			400,
		);
	}

	const metadata: Record<string, ImageMetadataFilterValue> = {
		status: "complete",
	};
	if (
		query.data.min_score !== undefined ||
		query.data.max_score !== undefined
	) {
		const range: ImageMetadataFilterOperators = {};
		if (query.data.min_score !== undefined) range.gte = query.data.min_score;
		if (query.data.max_score !== undefined) range.lte = query.data.max_score;
		metadata["ai_detection.detection.score"] = range;
	}

	try {
		const page = await c.env.IMAGES.hosted.list({
			creator: CREATOR,
			limit: query.data.limit,
			cursor: query.data.cursor,
			filter: { metadata },
		});
		return c.json(
			{
				images: page.images.map((image) => ({
					id: image.id,
					filename: image.filename,
					uploaded: image.uploaded,
					meta: image.meta,
				})),
				cursor: page.cursor ?? null,
			},
			200,
			{ "cache-control": "no-store" },
		);
	} catch (error) {
		console.error("Could not list Images", error);
		throw new HttpError(502, "could not list images");
	}
});

app.notFound((c) => c.json<ErrorResponse>({ error: "not found" }, 404));

app.onError((error, c) => {
	if (error instanceof HttpError)
		return c.json<ErrorResponse>({ error: error.message }, error.status);
	console.error("Images request failed", error);
	return c.json<ErrorResponse>({ error: "request failed" }, 500);
});

function validateConfig(env: Env): void {
	const validExpiry =
		Number.isInteger(env.UPLOAD_EXPIRES_IN) &&
		env.UPLOAD_EXPIRES_IN >= 120 &&
		env.UPLOAD_EXPIRES_IN <= 21600;
	const validSize =
		Number.isInteger(env.MAX_IMAGE_BYTES) && env.MAX_IMAGE_BYTES > 0;
	if (!validExpiry || !validSize)
		throw new HttpError(500, "server upload limits are misconfigured");
}

async function getOwnedImage(
	env: Env,
	id: string,
): Promise<ImageMetadata | null> {
	try {
		const details = await env.IMAGES.hosted.image(id).details();
		return details?.creator === CREATOR ? details : null;
	} catch (error) {
		console.error("Could not read image details", error);
		throw new HttpError(502, "could not read image details");
	}
}

async function readImage(
	stream: ReadableStream<Uint8Array>,
	maxBytes: number,
): Promise<ArrayBuffer> {
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > maxBytes) {
				await reader.cancel();
				throw new HttpError(413, `image exceeds the ${maxBytes} byte limit`);
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}

	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes.buffer;
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

export default app satisfies ExportedHandler<Env>;
