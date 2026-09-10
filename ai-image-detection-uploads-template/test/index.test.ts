import { env, SELF } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { detectImage } from "../src/detection";
import "./images-binding-shim";

const BASE = "https://example.com";

const PNG_BYTES = Uint8Array.from(
	atob(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
	),
	(char) => char.charCodeAt(0),
);

describe("POST /uploads", () => {
	it("creates a direct upload URL and a pending metadata record", async () => {
		const res = await SELF.fetch(`${BASE}/uploads`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { id: string; upload_url: string };
		expect(body.id).toBeTruthy();
		expect(body.upload_url).toContain("http");

		const details = await env.IMAGES.hosted.image(body.id).details();
		expect(details?.draft).toBe(true);
		expect(details?.meta).toMatchObject({ status: "pending", mode: "basic" });
	});

	it("rejects an invalid mode", async () => {
		const res = await SELF.fetch(`${BASE}/uploads`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ mode: "ludicrous" }),
		});
		expect(res.status).toBe(400);
	});

	it("rejects malformed JSON", async () => {
		const res = await SELF.fetch(`${BASE}/uploads`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "not json",
		});
		expect(res.status).toBe(400);
	});

	it("respects an explicitly requested mode", async () => {
		const res = await SELF.fetch(`${BASE}/uploads`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ mode: "fast" }),
		});
		const { id } = (await res.json()) as { id: string };
		const details = await env.IMAGES.hosted.image(id).details();
		expect(details?.meta).toMatchObject({ mode: "fast" });
	});
});

describe("GET /uploads/:id", () => {
	it("404s for an unknown id", async () => {
		const res = await SELF.fetch(`${BASE}/uploads/does-not-exist`);
		expect(res.status).toBe(404);
	});

	it("reports pending status before bytes are uploaded", async () => {
		const created = await SELF.fetch(`${BASE}/uploads`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({}),
		}).then((res) => res.json() as Promise<{ id: string }>);

		const res = await SELF.fetch(`${BASE}/uploads/${created.id}`);
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({ status: "pending" });
	});
});

describe("POST /uploads/:id/analyze", () => {
	it("404s for an unknown id", async () => {
		const res = await SELF.fetch(`${BASE}/uploads/does-not-exist/analyze`, {
			method: "POST",
		});
		expect(res.status).toBe(404);
	});

	it("refuses to analyze an image that is still a draft (no bytes yet)", async () => {
		const created = await SELF.fetch(`${BASE}/uploads`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({}),
		}).then((res) => res.json() as Promise<{ id: string }>);

		const res = await SELF.fetch(`${BASE}/uploads/${created.id}/analyze`, {
			method: "POST",
		});
		expect(res.status).toBe(409);
	});

	it("analyzes an uploaded image without discarding existing metadata", async () => {
		const seeded = await env.IMAGES.hosted.upload(PNG_BYTES.buffer, {
			creator: "ai-image-detection-uploads-template",
			filename: "test.png",
			metadata: { status: "pending", mode: "basic", custom: "keep-me" },
		});

		const run = vi.spyOn(env.AI, "run").mockResolvedValue({
			score: 0.5,
			mode: "basic",
			model_version: "v2",
			inference_time_ms: 12,
		});

		const res = await SELF.fetch(`${BASE}/uploads/${seeded.id}/analyze`, {
			method: "POST",
		});
		run.mockRestore();
		expect(res.status).toBe(200);
		const result = (await res.json()) as {
			detection: { score: number };
			source: { image_id: string };
		};
		expect(result.source.image_id).toBe(seeded.id);
		expect(result.detection.score).toBe(0.5);

		const details = await env.IMAGES.hosted.image(seeded.id).details();
		expect(details?.meta).toMatchObject({
			status: "complete",
			custom: "keep-me",
		});
		expect(
			(details?.meta as { ai_detection?: unknown })?.ai_detection,
		).toBeTruthy();
	});

	it("does not analyze images created outside this template", async () => {
		const seeded = await env.IMAGES.hosted.upload(PNG_BYTES.buffer, {
			filename: "other.png",
		});
		const res = await SELF.fetch(`${BASE}/uploads/${seeded.id}/analyze`, {
			method: "POST",
		});
		expect(res.status).toBe(404);
	});
});

describe("GET /images (metadata filtering)", () => {
	it("translates ?min_score=&max_score= into a bounded range condition", async () => {
		const list = vi
			.spyOn(env.IMAGES.hosted, "list")
			.mockResolvedValue({ images: [], listComplete: true });
		await SELF.fetch(`${BASE}/images?min_score=0.5&max_score=0.9`);

		expect(list).toHaveBeenCalledWith(
			expect.objectContaining({
				creator: "ai-image-detection-uploads-template",
				filter: {
					metadata: {
						status: "complete",
						"ai_detection.detection.score": { gte: 0.5, lte: 0.9 },
					},
				},
			}),
		);
		list.mockRestore();
	});

	it("returns images from list() with their stored metadata intact", async () => {
		const seeded = await env.IMAGES.hosted.upload(PNG_BYTES.buffer, {
			creator: "ai-image-detection-uploads-template",
			filename: "filter-me.png",
			metadata: {
				status: "complete",
				ai_detection: { detection: { score: 0.95 } },
			},
		});

		const res = await SELF.fetch(`${BASE}/images`);
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			images: Array<{ id: string; meta: { status: string } }>;
		};
		const found = body.images.find((image) => image.id === seeded.id);
		expect(found?.meta).toMatchObject({ status: "complete" });
	});

	it("rejects invalid score ranges", async () => {
		for (const query of [
			"min_score=abc",
			"min_score=-1",
			"max_score=2",
			"min_score=0.8&max_score=0.2",
		]) {
			const res = await SELF.fetch(`${BASE}/images?${query}`);
			expect(res.status).toBe(400);
		}
	});
});

describe("routing", () => {
	it("404s for an unknown route", async () => {
		const res = await SELF.fetch(`${BASE}/does-not-exist`);
		expect(res.status).toBe(404);
	});

	it("allows all origins by default", async () => {
		const res = await SELF.fetch(`${BASE}/images`, {
			headers: { origin: "https://some-site.example" },
		});
		expect(res.headers.get("access-control-allow-origin")).toBe("*");
	});

	it("uses an explicit preflight header allowlist", async () => {
		const res = await SELF.fetch(`${BASE}/uploads`, {
			method: "OPTIONS",
			headers: {
				origin: "https://some-site.example",
				"access-control-request-method": "POST",
				"access-control-request-headers": "content-type",
			},
		});
		expect(res.headers.get("access-control-allow-headers")).toBe(
			"Content-Type,Authorization",
		);
	});
});

describe("detectImage", () => {
	it("returns the documented model response", async () => {
		const modelResult = {
			score: 0.77,
			mode: "basic",
			model_version: "v2",
			inference_time_ms: 18,
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
			score: 0.77,
			mode: "basic",
			model_version: "v2",
			inference_time_ms: 18,
		};
		const run = vi
			.fn()
			.mockResolvedValue(JSON.stringify({ output: { result: modelResult } }));
		await expect(
			detectImage({ AI: { run } }, PNG_BYTES.buffer, "image/png", "basic"),
		).resolves.toEqual(modelResult);
	});

	it("rejects incomplete payloads inside response envelopes", async () => {
		const run = vi.fn().mockResolvedValue({ output: { score: 0.77 } });
		await expect(
			detectImage({ AI: { run } }, PNG_BYTES.buffer, "image/png", "basic"),
		).rejects.toMatchObject({
			status: 502,
		});
	});
});
