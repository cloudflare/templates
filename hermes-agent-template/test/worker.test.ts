import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";

const auth = vi.hoisted(() => ({ keys: undefined as unknown }));
vi.mock("jose", async (original) => ({
	...(await original<typeof import("jose")>()),
	createRemoteJWKSet: () => auth.keys,
}));
import worker from "../src/index";
import { Outbound } from "../src/outbound";
import { HermesSandbox } from "../src/sandbox";
import { modelBaseUrl } from "../src/helpers";

const gatewayEnv = {
	AI_GATEWAY_ID: "hermes-test",
	MODEL: "openai/gpt-4.1-mini",
};
const modelUrl = `${modelBaseUrl}/chat/completions`;
const stream = (text: string) => new Response(text).body!;
const issuer = "https://team.cloudflareaccess.com";
let privateKey: CryptoKey;
beforeAll(async () => {
	const pair = await generateKeyPair("RS256");
	privateKey = pair.privateKey;
	auth.keys = createLocalJWKSet({ keys: [await exportJWK(pair.publicKey)] });
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});
async function token(sub = "alice", aud = "app", expires = "1h") {
	return new SignJWT({ sub })
		.setProtectedHeader({ alg: "RS256" })
		.setIssuer(issuer)
		.setAudience(aud)
		.setExpirationTime(expires)
		.sign(privateKey);
}
function boundary() {
	const fetch = vi.fn().mockResolvedValue(new Response("dashboard"));
	const idFromName = vi.fn((name) => name);
	const env = {
		...gatewayEnv,
		ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
		ACCESS_AUD: "app",
		SANDBOX: { idFromName, get: vi.fn(() => ({ fetch })) },
	};
	return { env, fetch, idFromName };
}
describe("Access boundary", () => {
	it("shows setup instructions for placeholder configuration without allocating a container", async () => {
		const { env, idFromName } = boundary();
		env.ACCESS_TEAM_DOMAIN = "YOUR-TEAM.cloudflareaccess.com";
		const response = await worker.fetch(
			new Request("https://demo.test/"),
			env as never,
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toContain("text/html");
		expect(await response.text()).toContain("Set up Hermes Agent");
		expect(
			(
				await worker.fetch(
					new Request("https://demo.test/api/status"),
					env as never,
				)
			).status,
		).toBe(503);
		expect(idFromName).not.toHaveBeenCalled();
	});
	it("rejects absent, invalid, expired and wrong-audience tokens before allocation", async () => {
		const { env, idFromName } = boundary();
		for (const jwt of [
			"",
			"forged",
			await token("alice", "other"),
			await token("alice", "app", "-1h"),
		]) {
			const r = await worker.fetch(
				new Request("https://demo.test", {
					headers: { "Cf-Access-Jwt-Assertion": jwt },
				}),
				env as never,
			);
			expect(r.status).toBe(401);
		}
		expect(idFromName).not.toHaveBeenCalled();
	});
	it("isolates signed-in users, while keeping one user's container stable", async () => {
		const { env, idFromName } = boundary();
		for (const sub of ["alice", "bob", "alice"]) {
			await worker.fetch(
				new Request("https://demo.test", {
					headers: {
						"Cf-Access-Jwt-Assertion": await token(sub),
						"Cf-Access-Authenticated-User-Email": "spoofed@example.com",
					},
				}),
				env as never,
			);
		}
		expect(idFromName.mock.calls.map(([name]) => name)).toEqual([
			"user:alice",
			"user:bob",
			"user:alice",
		]);
	});
	it("rejects cross-origin requests including WebSocket handshakes", async () => {
		const { env, idFromName } = boundary();
		const r = await worker.fetch(
			new Request("https://demo.test/api/pty", {
				headers: {
					"Cf-Access-Jwt-Assertion": await token(),
					Origin: "https://evil.test",
					Upgrade: "websocket",
				},
			}),
			env as never,
		);
		expect(r.status).toBe(403);
		expect(idFromName).not.toHaveBeenCalled();
	});
	it("logs out through Access", async () => {
		const { env } = boundary();
		const r = await worker.fetch(
			new Request("https://demo.test/auth/logout", {
				method: "POST",
				headers: { "Cf-Access-Jwt-Assertion": await token() },
			}),
			env as never,
		);
		expect(r.headers.get("Location")).toBe(
			"https://demo.test/cdn-cgi/access/logout",
		);
	});
});

describe("AI Gateway bridge", () => {
	const inputs = {
		model: gatewayEnv.MODEL,
		messages: [{ role: "user", content: "hello" }],
		stream: true,
	};
	const modelRequest = (data = inputs) =>
		new Request(modelUrl, {
			method: "POST",
			body: JSON.stringify(data),
			headers: {
				Authorization: "Bearer placeholder",
				"cf-aig-gateway-id": "wrong-gateway",
			},
		});
	const outbound = (run = vi.fn()) =>
		createOutbound({ ...gatewayEnv, AI: { run } });

	it("uses the binding and configured gateway, ignoring sandbox credentials", async () => {
		const run = vi.fn().mockResolvedValue(new Response("ok"));
		await outbound(run).fetch(modelRequest());
		expect(run).toHaveBeenCalledWith(
			gatewayEnv.MODEL,
			{ messages: inputs.messages, stream: true },
			{
				gateway: { id: "hermes-test", skipCache: true },
				returnRawResponse: true,
			},
		);
	});

	it("passes through streamed tool calls and upstream errors without rewriting them", async () => {
		const event =
			'data: {"choices":[{"delta":{"tool_calls":[]}}]}\n\ndata: [DONE]\n\n';
		const upstream = new Response(stream(event), {
			headers: { "Content-Type": "text/event-stream" },
		});
		const run = vi
			.fn()
			.mockResolvedValueOnce(upstream)
			.mockResolvedValueOnce(new Response("No credits", { status: 402 }));
		const response = await outbound(run).fetch(modelRequest());
		expect(response).toBe(upstream);
		expect(await response.text()).toBe(event);
		expect((await outbound(run).fetch(modelRequest())).status).toBe(402);
	});

	it.each(["openai/gpt-4.1-mini", "openai/gpt-5-mini"])(
		"handles Hermes's default reasoning option for %s",
		async (model) => {
			const run = vi.fn().mockResolvedValue(new Response("ok"));
			const bridge = createOutbound({
				...gatewayEnv,
				MODEL: model,
				AI: { run },
			});
			await bridge.fetch(
				new Request(modelUrl, {
					method: "POST",
					body: JSON.stringify({
						...inputs,
						model,
						reasoning_effort: "medium",
					}),
				}),
			);
			expect(run.mock.calls[0][1].reasoning_effort).toBe(
				model === "openai/gpt-4.1-mini" ? undefined : "medium",
			);
		},
	);

	it("rejects another model, malformed JSON, and oversized requests before inference", async () => {
		const run = vi.fn();
		expect(
			(
				await outbound(run).fetch(
					modelRequest({ ...inputs, model: "another-model" }),
				)
			).status,
		).toBe(400);
		for (const body of ["invalid-json", " ".repeat(4 * 1024 * 1024 + 1)]) {
			expect(
				(
					await outbound(run).fetch(
						new Request(modelUrl, { method: "POST", body }),
					)
				).status,
			).toBe(400);
		}
		expect(run).not.toHaveBeenCalled();
	});

	it.each([
		modelUrl.replace("https:", "http:"),
		modelUrl.replace("model.internal", "model.internal.evil.com"),
		modelUrl.replace("/chat/completions", "/models"),
		modelUrl.replace("model.internal", "model.internal:444"),
		`${modelUrl}?gateway=other`,
		"https://openrouter.ai/api/v1/chat/completions",
		"https://example.com",
	])("blocks %s", async (url) => {
		const run = vi.fn();
		const fetch = vi.fn();
		vi.stubGlobal("fetch", fetch);
		expect(
			(await outbound(run).fetch(new Request(url, { method: "POST" }))).status,
		).toBe(403);
		expect(fetch).not.toHaveBeenCalled();
		expect(run).not.toHaveBeenCalled();
	});
});

function fixture() {
	const forwarded: Request[] = [];
	const fetch = vi.fn(async (input: Request | string) => {
		if (String(input).endsWith("/api/status")) return new Response("ok");
		if (String(input).endsWith("/auth/password-login"))
			return new Response("ok", {
				headers: {
					"Set-Cookie": "hermes_session_at=internal-test-session; HttpOnly",
				},
			});
		forwarded.push(input as Request);
		return new Response("page", {
			headers: { "Set-Cookie": "must-not-leak=x" },
		});
	});
	const container = {
		running: false,
		images: { hermes: "image" },
		start: vi.fn(() => {
			container.running = true;
		}),
		getTcpPort: vi.fn(() => ({ fetch })),
		setInactivityTimeout: vi.fn(),
		interceptAllOutboundHttp: vi.fn(),
		interceptOutboundHttps: vi.fn(),
	};
	const storage = { get: vi.fn(), put: vi.fn() };
	const sandbox: HermesSandbox = Object.create(HermesSandbox.prototype);
	Object.defineProperties(sandbox, {
		ctx: { value: { container, storage, exports: { Outbound: {} } } },
		env: { value: gatewayEnv },
	});
	return { sandbox, container, forwarded, fetch, storage };
}
describe("dashboard lifecycle", () => {
	it("coalesces cold starts and strips external credentials before forwarding", async () => {
		const { sandbox, container, forwarded } = fixture();
		const request = new Request("https://demo.test/api/auth/me", {
			headers: {
				Cookie: "CF_Authorization=secret",
				Authorization: "Bearer secret",
				"Cf-Access-Jwt-Assertion": "secret",
				"Cf-Access-Client-Secret": "secret",
			},
		});
		const responses = await Promise.all([
			sandbox.fetch(request),
			sandbox.fetch(request),
		]);
		expect(container.start).toHaveBeenCalledOnce();
		expect(container.start.mock.calls[0][0]).toMatchObject({
			enableInternet: false,
		});
		expect(responses[0].headers.get("Set-Cookie")).toBeNull();
		for (const r of forwarded) {
			expect(r.headers.get("cookie")).toBe(
				"hermes_session_at=internal-test-session",
			);
			expect(r.headers.get("authorization")).toBeNull();
			expect(r.headers.get("cf-access-jwt-assertion")).toBeNull();
			expect(r.headers.get("cf-access-client-secret")).toBeNull();
		}
		await sandbox.fetch(request);
		expect(container.start).toHaveBeenCalledOnce();
	});
	it("restarts an expired container and authenticates its new backend", async () => {
		const { sandbox, container, fetch } = fixture();
		await sandbox.fetch(new Request("https://demo.test"));
		container.running = false;
		await sandbox.fetch(new Request("https://demo.test"));
		expect(container.start).toHaveBeenCalledTimes(2);
		expect(
			fetch.mock.calls.filter(([url]) =>
				String(url).endsWith("password-login"),
			),
		).toHaveLength(2);
	});
	it("does not proxy requests when backend authentication fails", async () => {
		const { sandbox, fetch, forwarded } = fixture();
		fetch.mockImplementation(async () => new Response("", { status: 200 }));
		const r = await sandbox.fetch(new Request("https://demo.test"));
		expect(r.status).toBe(503);
		expect(forwarded).toHaveLength(0);
	});
});

function createOutbound(env: unknown): Outbound {
	const outbound: Outbound = Object.create(Outbound.prototype);
	Object.defineProperty(outbound, "env", { value: env });
	return outbound;
}
