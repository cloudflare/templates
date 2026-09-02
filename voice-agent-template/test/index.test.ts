import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const BASE = "https://example.com";

describe("voice agent worker", () => {
	it("serves an unauthenticated health endpoint with the fixed pipeline", async () => {
		const response = await SELF.fetch(`${BASE}/health`);
		const body = (await response.json()) as {
			status: string;
			agent: string;
			pipeline: Record<string, string>;
		};

		expect(response.status).toBe(200);
		expect(body).toEqual({
			status: "ok",
			agent: "arya",
			pipeline: {
				stt: "flux",
				llm: "@cf/openai/gpt-oss-20b",
				tts: "aura-1",
				voice: "asteria",
			},
		});
	});

	it("serves the backend-only status page", async () => {
		const response = await SELF.fetch(BASE);
		const body = await response.text();

		expect(response.status).toBe(200);
		expect(body).toContain("Cloudflare Docs Voice Agent");
		expect(body).toContain("Do not expose the long-lived token");
		expect(body).not.toContain("test-voice-agent-token");
	});

	it("rejects an Agent request without waking the protected handler", async () => {
		const response = await SELF.fetch(`${BASE}/agents/voice-agent/test`);
		expect(response.status).toBe(401);
		expect(await response.text()).not.toContain('"ok":true');
	});

	it("rejects an Agent request with an incorrect token", async () => {
		const response = await SELF.fetch(`${BASE}/agents/voice-agent/test`, {
			headers: { authorization: "Bearer incorrect-token" },
		});
		expect(response.status).toBe(401);
	});

	it("routes an Agent request with the configured token", async () => {
		const response = await SELF.fetch(`${BASE}/agents/voice-agent/test`, {
			headers: { authorization: "Bearer test-voice-agent-token" },
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			ok: true,
			agent: "arya",
			pipeline: {
				stt: "flux",
				llm: "@cf/openai/gpt-oss-20b",
				tts: "aura-1",
				voice: "asteria",
			},
		});
	});

	it("returns 404 for unrelated paths", async () => {
		const response = await SELF.fetch(`${BASE}/missing`);
		expect(response.status).toBe(404);
	});
});
