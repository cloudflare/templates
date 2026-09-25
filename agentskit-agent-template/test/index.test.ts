import { describe, expect, it, vi } from "vitest";
import { MODEL_ID, parseWorkersAIStream } from "../src/adapter";
import { handleRequest, type Env } from "../src/index";

const encoder = new TextEncoder();

function aiStream(events: string[]): ReadableStream<Uint8Array> {
	return new ReadableStream({
		start(controller) {
			for (const event of events) controller.enqueue(encoder.encode(event));
			controller.close();
		},
	});
}

function createEnv(
	events = ['data: {"response":"Hello"}\n\n', "data: [DONE]\n\n"],
) {
	const run = vi.fn().mockResolvedValue(aiStream(events));
	const fetch = vi.fn().mockResolvedValue(new Response("asset"));
	return {
		env: {
			AI: { run } as unknown as Ai,
			ASSETS: { fetch } as unknown as Fetcher,
		},
		run,
		fetch,
	};
}

function chatRequest(body: unknown, method = "POST") {
	return new Request("https://example.com/api/chat", {
		method,
		headers: { "content-type": "application/json" },
		body: method === "POST" ? JSON.stringify(body) : undefined,
	});
}

describe("AgentsKit agent template", () => {
	it("returns service information from the health endpoint", async () => {
		const { env } = createEnv();
		const response = await handleRequest(
			new Request("https://example.com/api/health"),
			env,
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			ok: true,
			adapter: "AgentsKit",
			model: MODEL_ID,
		});
	});

	it("rejects unsupported chat methods", async () => {
		const { env } = createEnv();
		const response = await handleRequest(chatRequest({}, "GET"), env);
		expect(response.status).toBe(405);
	});

	it("rejects malformed JSON", async () => {
		const { env } = createEnv();
		const request = new Request("https://example.com/api/chat", {
			method: "POST",
			body: "{",
		});
		const response = await handleRequest(request, env);
		expect(response.status).toBe(400);
		expect(await response.text()).toContain("valid JSON");
	});

	it("rejects an empty message list", async () => {
		const { env } = createEnv();
		const response = await handleRequest(chatRequest({ messages: [] }), env);
		expect(response.status).toBe(400);
		expect(await response.text()).toContain("at least one");
	});

	it("rejects invalid message roles", async () => {
		const { env } = createEnv();
		const response = await handleRequest(
			chatRequest({ messages: [{ role: "tool", content: "result" }] }),
			env,
		);
		expect(response.status).toBe(400);
		expect(await response.text()).toContain("message role");
	});

	it("rejects oversized message content", async () => {
		const { env } = createEnv();
		const response = await handleRequest(
			chatRequest({ messages: [{ role: "user", content: "x".repeat(8_001) }] }),
			env,
		);
		expect(response.status).toBe(400);
		expect(await response.text()).toContain("8000");
	});

	it("invokes Workers AI and streams AgentsKit chunks", async () => {
		const { env, run } = createEnv([
			'data: {"response":"Hello "}\n\n',
			'data: {"response":"from the edge"}\n\n',
			"data: [DONE]\n\n",
		]);
		const response = await handleRequest(
			chatRequest({ messages: [{ role: "user", content: "Hello" }] }),
			env,
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/event-stream");
		expect(await response.text()).toContain('"content":"from the edge"');
		expect(run).toHaveBeenCalledWith(
			MODEL_ID,
			expect.objectContaining({
				messages: [{ role: "user", content: "Hello" }],
				stream: true,
			}),
		);
	});

	it("turns a Workers AI stream failure into an AgentsKit error chunk", async () => {
		const { env } = createEnv(['data: {"error":"provider unavailable"}\n\n']);
		const response = await handleRequest(
			chatRequest({ messages: [{ role: "user", content: "Hello" }] }),
			env,
		);
		const text = await response.text();
		expect(text).toContain('"type":"error"');
		expect(text).toContain("provider unavailable");
	});

	it("parses SSE events split across network chunks", async () => {
		const chunks = [];
		for await (const chunk of parseWorkersAIStream(
			aiStream(['data: {"res', 'ponse":"split"}\n\n']),
		)) {
			chunks.push(chunk);
		}
		expect(chunks).toEqual([
			{ type: "text", content: "split" },
			{ type: "done" },
		]);
	});

	it("routes static assets and returns JSON for unknown API paths", async () => {
		const { env, fetch } = createEnv();
		const asset = await handleRequest(new Request("https://example.com/"), env);
		expect(await asset.text()).toBe("asset");
		expect(fetch).toHaveBeenCalledOnce();

		const missing = await handleRequest(
			new Request("https://example.com/api/missing"),
			env,
		);
		expect(missing.status).toBe(404);
	});

	it("reports a missing Workers AI binding before reading the request", async () => {
		const { env } = createEnv();
		const response = await handleRequest(
			chatRequest({ messages: [{ role: "user", content: "Hello" }] }),
			{ ...env, AI: undefined } as unknown as Env,
		);
		expect(response.status).toBe(500);
		expect(await response.text()).toContain("not configured");
	});
});
