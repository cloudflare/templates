import { env, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkProvenance } from "../src/c2pa";
import { detectImage } from "../src/detection";
import {
	claimJob,
	completeJob,
	createJob,
	failJob,
	getJob,
	setRetrying,
} from "../src/jobs";
import { queueConsumer } from "../src/queue";
import type { ProvenanceResult } from "../src/schema";
import { fetchSource } from "../src/source";

const BASE = "https://example.com";

const PNG_BYTES = Uint8Array.from(
	atob(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
	),
	(char) => char.charCodeAt(0),
);

const COMPLETED_RESULT: ProvenanceResult = {
	detection: {
		model: "@cf/images/ai-image-detection",
		score: 0.5,
		mode: "basic",
		model_version: "v2",
		inference_time_ms: 10,
	},
	provenance: {
		c2pa: { status: "not_found" },
		metadata: { status: "not_found", capture_hints: [], ai_hints: [] },
	},
	source: {
		url: "https://example.com/image.png",
		content_type: "image/png",
		bytes: PNG_BYTES.byteLength,
	},
	timing_ms: { fetch: 1, provenance: 1, total: 3 },
};

describe("POST /analyze", () => {
	it("rejects malformed JSON", async () => {
		const response = await SELF.fetch(`${BASE}/analyze`, {
			method: "POST",
			body: "not json",
		});
		expect(response.status).toBe(400);
	});

	it("rejects a missing URL", async () => {
		const response = await SELF.fetch(`${BASE}/analyze`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "{}",
		});
		expect(response.status).toBe(400);
	});

	it("rejects non-HTTPS URLs and embedded credentials", async () => {
		for (const url of [
			"http://example.com/image.jpg",
			"https://user:pass@example.com/image.jpg",
		]) {
			const response = await SELF.fetch(`${BASE}/analyze`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ url }),
			});
			expect(response.status).toBe(400);
		}
	});

	it("rejects an invalid mode", async () => {
		const response = await SELF.fetch(`${BASE}/analyze`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				url: "https://example.com/image.jpg",
				mode: "ludicrous",
			}),
		});
		expect(response.status).toBe(400);
	});
});

describe("job lifecycle", () => {
	it("queues a job and makes it pollable", async () => {
		const analyze = await SELF.fetch(`${BASE}/analyze`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ url: "https://example.com/cat.jpg" }),
		});
		expect(analyze.status).toBe(202);
		const queued = (await analyze.json()) as { job_id: string; status: string };
		expect(queued).toMatchObject({ status: "queued" });
		expect(queued.job_id).toMatch(/^[0-9a-f-]{36}$/);

		const response = await SELF.fetch(`${BASE}/jobs/${queued.job_id}`);
		expect(response.status).toBe(200);
		const job = (await response.json()) as { job_id: string; status: string };
		expect(job.job_id).toBe(queued.job_id);
		expect(["queued", "processing", "retrying"]).toContain(job.status);
	});

	it("stores the requested mode in D1", async () => {
		const analyze = await SELF.fetch(`${BASE}/analyze`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				url: "https://example.com/dog.jpg",
				mode: "fast",
			}),
		});
		const { job_id: jobId } = (await analyze.json()) as { job_id: string };
		const row = await env.JOBS.prepare(
			"SELECT source_url, mode FROM jobs WHERE id = ?",
		)
			.bind(jobId)
			.first();
		expect(row).toMatchObject({
			source_url: "https://example.com/dog.jpg",
			mode: "fast",
		});
	});

	it("reports retrying jobs without marking them failed", async () => {
		const job = {
			id: crypto.randomUUID(),
			url: "https://example.com/retry.jpg",
			mode: "basic" as const,
		};
		await createJob(env, job);
		expect(await claimJob(env, job.id, 1)).toBe(true);
		expect(await setRetrying(env, job.id, 1, "analysis failed")).toBe(true);
		expect(await getJob(env, job.id)).toEqual({
			job_id: job.id,
			status: "retrying",
		});
		expect(await claimJob(env, job.id, 2)).toBe(true);
	});

	it("does not run the same delivery attempt twice", async () => {
		const job = {
			id: crypto.randomUUID(),
			url: "https://example.com/duplicate.jpg",
			mode: "basic" as const,
		};
		await createJob(env, job);
		expect(await claimJob(env, job.id, 1)).toBe(true);
		expect(await claimJob(env, job.id, 1)).toBe(false);
	});

	it("does not reclaim a completed job or accept a stale result", async () => {
		const job = {
			id: crypto.randomUUID(),
			url: "https://example.com/complete.jpg",
			mode: "basic" as const,
		};
		await createJob(env, job);
		expect(await claimJob(env, job.id, 1)).toBe(true);
		expect(await claimJob(env, job.id, 2)).toBe(true);
		expect(await completeJob(env, job.id, 1, COMPLETED_RESULT)).toBe(false);
		expect(await completeJob(env, job.id, 2, COMPLETED_RESULT)).toBe(true);
		expect(await claimJob(env, job.id, 3)).toBe(false);
		expect(await getJob(env, job.id)).toMatchObject({ status: "complete" });
	});

	it("keeps enqueue failures terminal", async () => {
		const job = {
			id: crypto.randomUUID(),
			url: "https://example.com/not-queued.jpg",
			mode: "basic" as const,
		};
		await createJob(env, job);
		expect(await failJob(env, job.id, "could not queue analysis")).toBe(true);
		expect(await claimJob(env, job.id, 1)).toBe(false);
		expect(await getJob(env, job.id)).toEqual({
			job_id: job.id,
			status: "failed",
			error: "could not queue analysis",
		});
	});

	it("returns 404 for an unknown job", async () => {
		const response = await SELF.fetch(`${BASE}/jobs/does-not-exist`);
		expect(response.status).toBe(404);
	});
});

describe("queue delivery", () => {
	it("retries instead of acknowledging when the D1 claim fails", async () => {
		const ack = vi.fn();
		const retry = vi.fn();
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const job = {
			id: crypto.randomUUID(),
			url: "https://example.com/claim-error.jpg",
			mode: "basic" as const,
		};
		const batch = {
			queue: "test",
			messages: [
				{
					id: crypto.randomUUID(),
					timestamp: new Date(),
					body: job,
					attempts: 1,
					ack,
					retry,
				},
			],
			metadata: {
				metrics: { backlogCount: 1, backlogBytes: 1 },
			},
			ackAll: vi.fn(),
			retryAll: vi.fn(),
		} satisfies MessageBatch<typeof job>;
		const brokenEnv = {
			JOBS: {
				prepare: vi.fn(() => {
					throw new Error("D1 unavailable");
				}),
			},
		} as unknown as Parameters<typeof queueConsumer>[1];

		await queueConsumer(batch, brokenEnv);

		expect(retry).toHaveBeenCalledOnce();
		expect(ack).not.toHaveBeenCalled();
		expect(consoleError).toHaveBeenCalledOnce();
		consoleError.mockRestore();
	});
});

describe("routing", () => {
	it("returns 404 for an unknown route", async () => {
		const response = await SELF.fetch(`${BASE}/does-not-exist`);
		expect(response.status).toBe(404);
	});

	it("allows all origins by default", async () => {
		const response = await SELF.fetch(`${BASE}/jobs/anything`, {
			headers: { origin: "https://some-site.example" },
		});
		expect(response.headers.get("access-control-allow-origin")).toBe("*");
	});

	it("uses an explicit preflight header allowlist", async () => {
		const response = await SELF.fetch(`${BASE}/analyze`, {
			method: "OPTIONS",
			headers: {
				origin: "https://some-site.example",
				"access-control-request-method": "POST",
				"access-control-request-headers": "content-type",
			},
		});
		expect(response.headers.get("access-control-allow-headers")).toBe(
			"Content-Type,Authorization",
		);
	});
});

describe("detectImage", () => {
	it("returns the documented model response", async () => {
		const modelResult = {
			score: 0.42,
			mode: "basic",
			model_version: "v2",
			inference_time_ms: 16,
		};
		const run = vi.fn().mockResolvedValue(modelResult);
		const result = await detectImage(
			{ AI: { run } },
			PNG_BYTES.buffer,
			"image/png",
			"basic",
		);
		expect(result).toEqual(modelResult);
	});

	it("normalizes nested Workers AI envelopes and JSON responses", async () => {
		const modelResult = {
			score: 0.42,
			mode: "basic",
			model_version: "v2",
			inference_time_ms: 16,
		};
		const run = vi
			.fn()
			.mockResolvedValue(JSON.stringify({ output: { result: modelResult } }));
		await expect(
			detectImage({ AI: { run } }, PNG_BYTES.buffer, "image/png", "basic"),
		).resolves.toEqual(modelResult);
	});

	it("rejects incomplete payloads inside response envelopes", async () => {
		const run = vi.fn().mockResolvedValue({ result: { score: 0.42 } });
		await expect(
			detectImage({ AI: { run } }, PNG_BYTES.buffer, "image/png", "basic"),
		).rejects.toMatchObject({
			status: 502,
		});
	});

	it("rejects a score outside the documented range", async () => {
		const run = vi.fn().mockResolvedValue({
			score: 2,
			mode: "basic",
			model_version: "v2",
			inference_time_ms: 16,
		});
		await expect(
			detectImage({ AI: { run } }, PNG_BYTES.buffer, "image/png", "basic"),
		).rejects.toMatchObject({
			status: 502,
		});
	});
});

describe("checkProvenance", () => {
	it("does not contact the container when both checks are disabled", async () => {
		const result = await checkProvenance(env, PNG_BYTES.buffer, "image/png", {
			enableC2PA: false,
			enableMetadataCheck: false,
		});
		expect(result).toEqual({
			c2pa: { status: "disabled" },
			metadata: { status: "disabled", capture_hints: [], ai_hints: [] },
		});
	});
});

describe("fetchSource", () => {
	const sourceEnv = {
		MAX_IMAGE_BYTES: 1_000_000,
		MAX_REDIRECTS: 3,
		FETCH_RETRIES: 1,
		FETCH_TIMEOUT_MS: 5000,
	};

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("detects image type from bytes instead of the response header", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(PNG_BYTES, {
					status: 200,
					headers: { "content-type": "text/plain" },
				}),
			),
		);
		const source = await fetchSource("https://example.com/image", sourceEnv);
		expect(source.contentType).toBe("image/png");
	});

	it("rejects invalid bytes with an image content type", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response("not an image", {
					headers: { "content-type": "image/png" },
				}),
			),
		);
		await expect(
			fetchSource("https://example.com/image", sourceEnv),
		).rejects.toMatchObject({ status: 415 });
	});

	it("stops reading a streamed response at the byte limit", async () => {
		const body = new ReadableStream({
			start(controller) {
				controller.enqueue(new Uint8Array(600_000));
				controller.enqueue(new Uint8Array(600_000));
				controller.close();
			},
		});
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
		await expect(
			fetchSource("https://example.com/image", sourceEnv),
		).rejects.toMatchObject({ status: 413 });
	});

	it("rejects credentials introduced by a redirect", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(null, {
					status: 302,
					headers: { location: "https://user:pass@example.com/image" },
				}),
			),
		);
		await expect(
			fetchSource("https://example.com/start", sourceEnv),
		).rejects.toMatchObject({ status: 400 });
	});

	it("reports an invalid redirect location as an upstream error", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(null, {
					status: 302,
					headers: { location: "https://[invalid" },
				}),
			),
		);
		await expect(
			fetchSource("https://example.com/start", sourceEnv),
		).rejects.toMatchObject({ status: 502 });
	});
});
