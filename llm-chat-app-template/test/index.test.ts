import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import worker from "../src/index";
import type { Env } from "../src/types";

function setup() {
	const run = vi.fn().mockResolvedValue(
		new ReadableStream({
			start(controller) {
				controller.close();
			},
		}),
	);
	const assets = vi.fn().mockResolvedValue(new Response("frontend"));
	const env: Env = { AI: { run } as unknown as Ai, ASSETS: { fetch: assets } };
	const fetch = (request: Request) =>
		worker.fetch(request, env, {} as ExecutionContext);
	return { run, assets, fetch };
}

afterEach(() => vi.restoreAllMocks());

describe("chat routes", () => {
	it("serves the frontend through the assets binding", async () => {
		const { fetch, assets, run } = setup();
		const request = new Request("https://example.com/");
		expect(await (await fetch(request)).text()).toBe("frontend");
		expect(assets).toHaveBeenCalledWith(request);
		expect(run).not.toHaveBeenCalled();
	});
	it("rejects unsupported chat methods without calling AI", async () => {
		const { fetch, run } = setup();
		expect(
			(await fetch(new Request("https://example.com/api/chat"))).status,
		).toBe(405);
		expect(run).not.toHaveBeenCalled();
	});
	it("returns 404 for unknown API routes", async () => {
		const { fetch } = setup();
		expect(
			(await fetch(new Request("https://example.com/api/missing"))).status,
		).toBe(404);
	});
	it("streams chat responses and supplies a default system prompt", async () => {
		const { fetch, run } = setup();
		const response = await fetch(
			new Request("https://example.com/api/chat", {
				method: "POST",
				body: JSON.stringify({
					messages: [{ role: "user", content: "Hello" }],
				}),
			}),
			{},
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe(
			"text/event-stream; charset=utf-8",
		);
		expect(run).toHaveBeenCalledWith(
			"@cf/meta/llama-3.1-8b-instruct-fp8",
			expect.objectContaining({
				stream: true,
				messages: [
					{ role: "system", content: expect.any(String) },
					{ role: "user", content: "Hello" },
				],
			}),
			{},
		);
	});
	it("returns a JSON error when AI fails", async () => {
		const { fetch, run } = setup();
		run.mockRejectedValue(new Error("Unavailable"));
		vi.spyOn(console, "error").mockImplementation(() => {});
		const response = await fetch(
			new Request("https://example.com/api/chat", {
				method: "POST",
				body: JSON.stringify({ messages: [] }),
			}),
			{},
		);
		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({
			error: "Failed to process request",
		});
	});
});
