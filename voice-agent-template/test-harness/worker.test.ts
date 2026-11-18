import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTestHarness } from "wrangler";

const TOKEN = "test-harness-voice-agent-token";
const WRONG_TOKEN = "test-harness-incorrect-token";
const AGENT_PATH = "/agents/voice-agent/test-harness";

const server = createTestHarness({
	workers: [
		{
			configPath: "./wrangler.jsonc",
			secrets: { VOICE_AGENT_TOKEN: TOKEN },
			bindingOverrides: { AI: "mock-ai" },
		},
		{
			config: {
				name: "mock-ai",
				main: "./test-harness/mockAi.ts",
				compatibility_date: "2025-10-08",
			},
		},
	],
});

beforeAll(async () => {
	await server.listen();
});

afterEach(async () => {
	await server.reset();
});

afterAll(async () => {
	await server.close();
});

describe("production Worker bundle", () => {
	it("rejects missing and incorrect credentials", async () => {
		const missing = await server.fetch(AGENT_PATH);
		expect(missing.status).toBe(401);

		const incorrect = await server.fetch(AGENT_PATH, {
			headers: { authorization: `Bearer ${WRONG_TOKEN}` },
		});
		expect(incorrect.status).toBe(401);
	});

	it("does not initialize the Durable Object for a rejected request", async () => {
		const instanceName = "unauthorized";
		server.clearLogs();
		const response = await server.fetch(`/agents/voice-agent/${instanceName}`);
		expect(response.status).toBe(401);
		expect(JSON.stringify(server.getLogs())).not.toContain(
			"voice agent initialized",
		);
	});

	it("rejects a WebSocket upgrade before initializing the Durable Object", async () => {
		server.clearLogs();
		const response = await server.fetch(AGENT_PATH, {
			headers: { upgrade: "websocket" },
		});

		expect(response.status).toBe(401);
		expect(JSON.stringify(server.getLogs())).not.toContain(
			"voice agent initialized",
		);
	});

	it("routes the fixed Agent with the configured credential", async () => {
		server.clearLogs();
		const response = await server.fetch(AGENT_PATH, {
			headers: { authorization: `Bearer ${TOKEN}` },
		});
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			ok: true,
			agent: "arya",
			pipeline: {
				stt: "flux",
				llm: "@cf/openai/gpt-oss-20b",
				tts: "aura-1",
				voice: "asteria",
			},
		});
		expect(JSON.stringify(server.getLogs())).toContain(
			"voice agent initialized",
		);
	});

	it("does not include supplied or configured credentials in runtime logs", async () => {
		server.clearLogs();
		await server.fetch(AGENT_PATH, {
			headers: { authorization: `Bearer ${WRONG_TOKEN}` },
		});

		const logs = JSON.stringify(server.getLogs());
		expect(logs).not.toContain(TOKEN);
		expect(logs).not.toContain(WRONG_TOKEN);
	});
});
