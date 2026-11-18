import { describe, expect, it } from "vitest";
import { authorizeVoiceAgentRequest } from "../src/auth";

const URL = "https://example.com/agents/voice-agent/test";
const TOKEN = "test-voice-agent-token";

function request(authorization?: string): Request {
	return new Request(URL, {
		headers: authorization ? { authorization } : undefined,
	});
}

describe("voice agent authentication", () => {
	it("fails closed when the configured token is missing", async () => {
		const response = await authorizeVoiceAgentRequest(request(), {});
		expect(response?.status).toBe(503);
		expect(await response?.text()).not.toContain(TOKEN);
	});

	it("rejects a missing authorization header", async () => {
		const response = await authorizeVoiceAgentRequest(request(), {
			VOICE_AGENT_TOKEN: TOKEN,
		});
		expect(response?.status).toBe(401);
		expect(response?.headers.get("www-authenticate")).toContain("Bearer");
	});

	it("rejects a malformed authorization header", async () => {
		const response = await authorizeVoiceAgentRequest(
			request(`Token ${TOKEN}`),
			{
				VOICE_AGENT_TOKEN: TOKEN,
			},
		);
		expect(response?.status).toBe(401);
	});

	it("rejects an incorrect bearer token without returning either token", async () => {
		const supplied = "incorrect-token";
		const response = await authorizeVoiceAgentRequest(
			request(`Bearer ${supplied}`),
			{ VOICE_AGENT_TOKEN: TOKEN },
		);
		const body = await response?.text();

		expect(response?.status).toBe(401);
		expect(body).not.toContain(TOKEN);
		expect(body).not.toContain(supplied);
	});

	it("accepts the configured bearer token", async () => {
		const response = await authorizeVoiceAgentRequest(
			request(`Bearer ${TOKEN}`),
			{ VOICE_AGENT_TOKEN: TOKEN },
		);
		expect(response).toBeUndefined();
	});
});
