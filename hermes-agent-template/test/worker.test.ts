import { afterEach, describe, expect, it, vi } from "vitest";
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
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});
function context(user_uuid = "alice") {
	return { access: { getIdentity: vi.fn().mockResolvedValue({ user_uuid }) } };
}
function boundary() {
	const fetch = vi.fn().mockResolvedValue(new Response("dashboard"));
	const idFromName = vi.fn((name) => name);
	const env = {
		...gatewayEnv,
		SANDBOX: { idFromName, get: vi.fn(() => ({ fetch })) },
	};
	return { env, fetch, idFromName };
}
describe("Access boundary", () => {
	it("shows setup instructions without allocating a container when Access is absent", async () => {
		const { env, idFromName } = boundary();
		const response = await worker.fetch(
			new Request("https://demo.test/"),
			env as never,
			{} as never,
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toContain("text/html");
		expect(await response.text()).toContain("Set up Hermes Agent");
		// Caller-supplied headers cannot stand in for the platform Access context.
		const api = await worker.fetch(
			new Request("https://demo.test/api/status", {
				headers: {
					"Cf-Access-Jwt-Assertion": "forged",
					"Cf-Access-Authenticated-User-Email": "alice@example.com",
				},
			}),
			env as never,
			{} as never,
		);
		expect(api.status).toBe(503);
		expect(idFromName).not.toHaveBeenCalled();
	});
	it("requires a gateway before allocating a container", async () => {
		const { env, idFromName } = boundary();
		env.AI_GATEWAY_ID = "";
		const response = await worker.fetch(
			new Request("https://demo.test/api/status"),
			env as never,
			context() as never,
		);
		expect(response.status).toBe(503);
		expect(idFromName).not.toHaveBeenCalled();
	});
	it("rejects missing user identities and identity lookup failures before allocation", async () => {
		const { env, idFromName } = boundary();
		const ctx = context();
		ctx.access.getIdentity
			.mockResolvedValueOnce(undefined)
			.mockResolvedValueOnce({})
			.mockResolvedValueOnce({ user_uuid: "" })
			.mockRejectedValueOnce(new Error("Identity unavailable"));
		for (let i = 0; i < 4; i++) {
			const response = await worker.fetch(
				new Request("https://demo.test/"),
				env as never,
				ctx as never,
			);
			expect(response.status).toBe(401);
		}
		expect(idFromName).not.toHaveBeenCalled();
	});
	it("isolates signed-in users, while keeping one user's container stable", async () => {
		const { env, idFromName } = boundary();
		for (const id of ["alice", "bob", "alice"]) {
			await worker.fetch(
				new Request("https://demo.test/", {
					headers: {
						"Cf-Access-Authenticated-User-Email": "spoofed@example.com",
					},
				}),
				env as never,
				context(id) as never,
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
		const response = await worker.fetch(
			new Request("https://demo.test/api/pty", {
				headers: { Origin: "https://evil.test", Upgrade: "websocket" },
			}),
			env as never,
			context() as never,
		);
		expect(response.status).toBe(403);
		expect(idFromName).not.toHaveBeenCalled();
	});
	it("logs out through Access", async () => {
		const { env } = boundary();
		const response = await worker.fetch(
			new Request("https://demo.test/auth/logout", { method: "POST" }),
			env as never,
			context() as never,
		);
		expect(response.headers.get("Location")).toBe(
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
