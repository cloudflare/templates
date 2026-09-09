import { Hono } from "hono";
import type { C2PAEnv } from "./c2pa";
import { corsFromEnv } from "./cors";
import type { DetectionEnv } from "./detection";
import { HttpError } from "./errors";
import { createJob, failJob, getJob, type JobsEnv } from "./jobs";
import { queueConsumer, type QueueEnv } from "./queue";
import {
	AnalyzeRequest,
	ModeSchema,
	type ErrorResponse,
	type Mode,
	type QueueJob,
} from "./schema";
import type { SourceEnv } from "./source";

export { C2PAContainer } from "./c2pa";

type Env = DetectionEnv &
	SourceEnv &
	JobsEnv &
	C2PAEnv &
	QueueEnv & {
		ALLOWED_ORIGINS: string;
		DEFAULT_MODE: Mode;
		PROVENANCE_QUEUE: Queue<QueueJob>;
	};

const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => corsFromEnv(c.env.ALLOWED_ORIGINS)(c, next));

app.post("/analyze", async (c) => {
	const body = await c.req.json().catch(() => null);
	const parsed = AnalyzeRequest.safeParse(body);
	if (!parsed.success) {
		return c.json<ErrorResponse>(
			{ error: parsed.error.issues[0]?.message ?? "invalid request body" },
			400,
		);
	}

	const job: QueueJob = {
		id: crypto.randomUUID(),
		url: parsed.data.url,
		mode: parsed.data.mode ?? parseDefaultMode(c.env.DEFAULT_MODE),
	};
	await createJob(c.env, job);
	try {
		await c.env.PROVENANCE_QUEUE.send(job);
	} catch (error) {
		console.error("Could not enqueue provenance job", error);
		await failJob(c.env, job.id, "could not queue analysis");
		throw new HttpError(502, "could not queue analysis");
	}

	return c.json({ job_id: job.id, status: "queued" as const }, 202);
});

app.get("/jobs/:id", async (c) => {
	const job = await getJob(c.env, c.req.param("id"));
	if (!job) return c.json<ErrorResponse>({ error: "job not found" }, 404);
	return c.json(job, 200, { "cache-control": "no-store" });
});

app.notFound((c) => c.json<ErrorResponse>({ error: "not found" }, 404));

app.onError((error, c) => {
	if (error instanceof HttpError)
		return c.json<ErrorResponse>({ error: error.message }, error.status);
	console.error("Provenance request failed", error);
	return c.json<ErrorResponse>({ error: "request failed" }, 500);
});

function parseDefaultMode(value: Mode): Mode {
	const mode = ModeSchema.safeParse(value);
	if (!mode.success)
		throw new HttpError(500, "server misconfigured: DEFAULT_MODE is invalid");
	return mode.data;
}

export default {
	fetch: app.fetch,
	queue: queueConsumer,
} satisfies ExportedHandler<Env, QueueJob>;
