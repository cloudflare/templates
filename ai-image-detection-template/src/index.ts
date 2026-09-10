import { Hono } from "hono";
import { corsFromEnv } from "./cors";
import { detectImage, MODEL, type DetectionEnv } from "./detection";
import { HttpError } from "./errors";
import {
	AnalyzeRequest,
	type DetectionResult,
	type ErrorResponse,
} from "./schema";
import { fetchSource, type SourceEnv } from "./source";

type Env = DetectionEnv &
	SourceEnv & {
		ALLOWED_ORIGINS: string;
	};

const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => corsFromEnv(c.env.ALLOWED_ORIGINS)(c, next));

app.post("/analyze", async (c) => {
	const started = performance.now();
	const body = await c.req.json().catch(() => null);
	const parsed = AnalyzeRequest.safeParse(body);
	if (!parsed.success) {
		return c.json<ErrorResponse>(
			{ error: parsed.error.issues[0]?.message ?? "invalid request body" },
			400,
		);
	}

	try {
		const mode = parsed.data.mode;

		const fetchStarted = performance.now();
		const source = await fetchSource(parsed.data.url, c.env);
		const fetchMs = performance.now() - fetchStarted;

		const detection = await detectImage(
			c.env,
			source.bytes,
			source.contentType,
			mode,
		);

		const result: DetectionResult = {
			detection: { model: MODEL, ...detection },
			source: {
				url: source.url,
				content_type: source.contentType,
				bytes: source.bytes.byteLength,
			},
			timing_ms: {
				fetch: Number(fetchMs.toFixed(3)),
				total: Number((performance.now() - started).toFixed(3)),
			},
		};
		return c.json(result, 200, { "cache-control": "no-store" });
	} catch (error) {
		if (error instanceof HttpError) {
			return c.json<ErrorResponse>({ error: error.message }, error.status);
		}
		console.error("Image analysis failed", error);
		return c.json<ErrorResponse>({ error: "analysis failed" }, 500);
	}
});

app.notFound((c) => c.json<ErrorResponse>({ error: "not found" }, 404));

export default app satisfies ExportedHandler<Env>;
