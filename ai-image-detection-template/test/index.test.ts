import { SELF } from "cloudflare:test";
import { describe, expect, it, vi, afterEach } from "vitest";
import { detectImage } from "../src/detection";
import { fetchSource } from "../src/source";

const BASE = "https://example.com";

const PNG_BYTES = Uint8Array.from(
	atob(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
	),
	(char) => char.charCodeAt(0),
);

describe("input validation (never reaches the model)", () => {
	it("rejects a request body that is not valid JSON", async () => {
		const res = await SELF.fetch(`${BASE}/analyze`, {
			method: "POST",
			body: "not json",
		});
		expect(res.status).toBe(400);
	});

	it("rejects a missing url field", async () => {
		const res = await SELF.fetch(`${BASE}/analyze`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(400);
	});

	it("rejects a non-https url", async () => {
		const res = await SELF.fetch(`${BASE}/analyze`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ url: "http://example.com/cat.jpg" }),
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain("https");
	});

	it("rejects an invalid mode", async () => {
		const res = await SELF.fetch(`${BASE}/analyze`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				url: "https://example.com/cat.jpg",
				mode: "ludicrous",
			}),
		});
		expect(res.status).toBe(400);
	});
});

describe("routing", () => {
	it("404s for an unknown route", async () => {
		const res = await SELF.fetch(`${BASE}/does-not-exist`);
		expect(res.status).toBe(404);
	});

	it("allows all origins by default", async () => {
		const res = await SELF.fetch(`${BASE}/analyze`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: "https://some-site.example",
			},
			body: JSON.stringify({}),
		});
		expect(res.headers.get("access-control-allow-origin")).toBe("*");
	});

	it("uses an explicit preflight header allowlist", async () => {
		const res = await SELF.fetch(`${BASE}/analyze`, {
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
			score: 0.83,
			mode: "advanced",
			model_version: "v2",
			inference_time_ms: 123.4,
		};
		const run = vi.fn().mockResolvedValue(modelResult);
		const result = await detectImage(
			{ AI: { run } },
			PNG_BYTES.buffer,
			"image/png",
			"advanced",
		);
		expect(result).toEqual(modelResult);
		expect(run).toHaveBeenCalledWith(
			"@cf/images/ai-image-detection",
			expect.objectContaining({
				image: expect.stringContaining("data:image/png;base64,"),
			}),
		);
	});

	it("normalizes nested Workers AI envelopes and JSON responses", async () => {
		const modelResult = {
			score: 0.83,
			mode: "advanced",
			model_version: "v2",
			inference_time_ms: 123.4,
		};
		const run = vi
			.fn()
			.mockResolvedValue(JSON.stringify({ output: { result: modelResult } }));
		await expect(
			detectImage({ AI: { run } }, PNG_BYTES.buffer, "image/png", "advanced"),
		).resolves.toEqual(modelResult);
	});

	it("rejects incomplete payloads inside response envelopes", async () => {
		const run = vi.fn().mockResolvedValue({ output: { score: 0.83 } });
		await expect(
			detectImage({ AI: { run } }, PNG_BYTES.buffer, "image/png", "advanced"),
		).rejects.toMatchObject({
			status: 502,
		});
	});

	it("rejects out-of-range and coercible scores", async () => {
		for (const score of [-0.1, 1.1, "0.5", null]) {
			const run = vi.fn().mockResolvedValue({
				score,
				mode: "basic",
				model_version: "v2",
				inference_time_ms: 10,
			});
			await expect(
				detectImage({ AI: { run } }, PNG_BYTES.buffer, "image/png", "basic"),
			).rejects.toMatchObject({
				status: 502,
			});
		}
	});

	it("rejects a response for a different mode", async () => {
		const run = vi.fn().mockResolvedValue({
			score: 0.5,
			mode: "fast",
			model_version: "v2",
			inference_time_ms: 10,
		});
		await expect(
			detectImage({ AI: { run } }, PNG_BYTES.buffer, "image/png", "advanced"),
		).rejects.toMatchObject({
			status: 502,
		});
	});
});

describe("fetchSource", () => {
	const sourceEnv = {
		MAX_IMAGE_BYTES: 1_000_000,
		MAX_REDIRECTS: 3,
		FETCH_RETRIES: 2,
		FETCH_TIMEOUT_MS: 5000,
	};

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("sniffs the real content type from magic bytes, ignoring a wrong declared type", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(PNG_BYTES, {
					status: 200,
					headers: { "content-type": "application/octet-stream" },
				}),
			),
		);
		const source = await fetchSource("https://example.com/image", sourceEnv);
		expect(source.contentType).toBe("image/png");
	});

	it("retries once on a 5xx before succeeding", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response("nope", { status: 503 }))
			.mockResolvedValueOnce(
				new Response(PNG_BYTES, {
					status: 200,
					headers: { "content-type": "image/png" },
				}),
			);
		vi.stubGlobal("fetch", fetchMock);
		const source = await fetchSource("https://example.com/image", sourceEnv);
		expect(source.contentType).toBe("image/png");
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("rejects bytes that do not match a supported image signature", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response("not an image", {
					status: 200,
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

	it("gives up after exceeding the redirect limit", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(null, {
					status: 302,
					headers: { location: "https://example.com/next" },
				}),
			),
		);
		await expect(
			fetchSource("https://example.com/start", {
				...sourceEnv,
				MAX_REDIRECTS: 1,
			}),
		).rejects.toMatchObject({
			status: 502,
		});
	});

	it("rejects a url containing embedded credentials before ever fetching", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		await expect(
			fetchSource("https://user:pass@example.com/image", sourceEnv),
		).rejects.toMatchObject({
			status: 400,
		});
		expect(fetchMock).not.toHaveBeenCalled();
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
