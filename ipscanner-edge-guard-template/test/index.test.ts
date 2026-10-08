import {
	createExecutionContext,
	waitOnExecutionContext,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";

const API = "https://ipscanner.io";

const human = {
	class: "human",
	confidence: 0.92,
	action: "allow",
	signals: { network_origin: "residential_clean", anonymized: false },
};
const cleanIp = {
	networkClass: "residential_clean",
	riskScore: 3,
	verdict: {
		classification: "residential_clean",
		anonymized: false,
		confidence: 0.9,
		method: "asn",
	},
	geo: { countryCode: "DE" },
};

interface Recorded {
	url: string;
	method: string;
	headers: Headers;
	body: string;
}

let calls: Recorded[];
let agentReply: () => Promise<Response>;
let ipReply: () => Promise<Response>;

function json(body: unknown, status = 200): Promise<Response> {
	return Promise.resolve(Response.json(body, { status }));
}

function hang(signal?: AbortSignal | null): Promise<Response> {
	return new Promise((_, reject) =>
		signal?.addEventListener("abort", () => reject(signal.reason)),
	);
}

beforeEach(() => {
	calls = [];
	agentReply = () => json(human);
	ipReply = () => json(cleanIp);
	vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
		const req = new Request(input, init);
		calls.push({
			url: req.url,
			method: req.method,
			headers: req.headers,
			body: await req.clone().text(),
		});
		if (req.url === `${API}/v1/agentscan/check`) return agentReply();
		if (req.url === `${API}/v1/ip/lookup`) return ipReply();
		return new Response("origin ok", { headers: { "X-Origin": "1" } });
	});
});

afterEach(() => {
	vi.restoreAllMocks();
});

function apiCalls(): Recorded[] {
	return calls.filter((c) => c.url.startsWith(API));
}

function originCall(): Recorded | undefined {
	return calls.find((c) => !c.url.startsWith(API));
}

async function send(
	path: string,
	opts: { ip?: string; vars?: Partial<Env>; init?: RequestInit } = {},
): Promise<Response> {
	const headers = new Headers(opts.init?.headers);
	headers.set("CF-Connecting-IP", opts.ip ?? "203.0.113.10");
	if (!headers.has("User-Agent")) headers.set("User-Agent", "Mozilla/5.0 test");
	const request = new Request(`https://example.com${path}`, {
		...opts.init,
		headers,
	});
	const ctx = createExecutionContext();
	const res = await worker.fetch(
		request as Request<unknown, IncomingRequestCfProperties>,
		{ ...env, ...opts.vars },
		ctx,
	);
	await waitOnExecutionContext(ctx);
	return res;
}

describe("monitor mode", () => {
	it("adds verdict headers to the origin request", async () => {
		const res = await send("/", { ip: "203.0.113.1" });
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("origin ok");
		const h = originCall()!.headers;
		expect(h.get("x-ipscanner-status")).toBe("ok");
		expect(h.get("x-ipscanner-class")).toBe("human");
		expect(h.get("x-ipscanner-action")).toBe("allow");
		expect(h.get("x-ipscanner-confidence")).toBe("0.92");
		expect(h.get("x-ipscanner-network-class")).toBe("residential_clean");
		expect(h.get("x-ipscanner-anonymized")).toBe("false");
		expect(h.get("x-ipscanner-risk")).toBe("3");
		expect(h.get("x-ipscanner-country")).toBe("DE");
	});

	it("does not block in monitor mode", async () => {
		agentReply = () =>
			json({ ...human, class: "malicious_automation", action: "block" });
		const res = await send("/", { ip: "203.0.113.2" });
		expect(res.status).toBe(200);
		expect(originCall()!.headers.get("x-ipscanner-action")).toBe("block");
	});

	it("sends the expected agentscan and lookup requests", async () => {
		await send("/", {
			ip: "203.0.113.3",
			init: {
				headers: {
					"Accept-Language": "en",
					"Sec-Fetch-Mode": "navigate",
					Cookie: "secret=1",
				},
			},
		});
		const agent = apiCalls().find((c) =>
			c.url.endsWith("/v1/agentscan/check"),
		)!;
		expect(agent.method).toBe("POST");
		expect(agent.headers.get("authorization")).toBe("Bearer test-key");
		expect(agent.headers.get("content-type")).toBe("application/json");
		const body = JSON.parse(agent.body);
		expect(body.ip).toBe("203.0.113.3");
		expect(body.user_agent).toBe("Mozilla/5.0 test");
		expect(body.headers).toEqual({
			"accept-language": "en",
			"sec-fetch-mode": "navigate",
		});
		const lookup = apiCalls().find((c) => c.url.endsWith("/v1/ip/lookup"))!;
		expect(JSON.parse(lookup.body)).toEqual({ target: "203.0.113.3" });
	});
});

describe("enforce mode", () => {
	const enforce = { MODE: "enforce" };

	it("blocks when agentscan says block", async () => {
		agentReply = () => json({ ...human, class: "ai_agent", action: "block" });
		const res = await send("/", {
			ip: "203.0.113.4",
			vars: enforce,
			init: { headers: { "CF-Ray": "abc123" } },
		});
		expect(res.status).toBe(403);
		const body = await res.text();
		expect(body).toContain("Blocked by IPScanner edge guard");
		expect(body).toContain("abc123");
		expect(originCall()).toBeUndefined();
	});

	it("blocks classes listed in BLOCK_CLASSES", async () => {
		agentReply = () => json({ ...human, class: "ai_agent", action: "flag" });
		const res = await send("/", {
			ip: "203.0.113.5",
			vars: { ...enforce, BLOCK_CLASSES: "ai_agent, malicious_automation" },
		});
		expect(res.status).toBe(403);
	});

	it("allows verified crawlers", async () => {
		agentReply = () =>
			json({
				class: "known_bot",
				confidence: 0.99,
				action: "block",
				signals: { allowlist_verified: true, allowlist_type: "search" },
			});
		const res = await send("/", { ip: "203.0.113.6", vars: enforce });
		expect(res.status).toBe(200);
		expect(originCall()!.headers.get("x-ipscanner-class")).toBe("known_bot");
	});

	it("blocks anonymized traffic when BLOCK_ANONYMIZED is on", async () => {
		ipReply = () =>
			json({
				...cleanIp,
				networkClass: "vpn",
				verdict: { ...cleanIp.verdict, anonymized: true },
			});
		const vars = { ...enforce, BLOCK_ANONYMIZED: "true" };
		expect((await send("/", { ip: "203.0.113.7", vars })).status).toBe(403);
		expect((await send("/", { ip: "203.0.113.7", vars: enforce })).status).toBe(
			200,
		);
	});
});

describe("fail open", () => {
	it("forwards with status timeout when the API is slow", async () => {
		vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
			const req = new Request(input, init);
			calls.push({
				url: req.url,
				method: req.method,
				headers: req.headers,
				body: "",
			});
			if (req.url.startsWith(API)) return hang(init?.signal);
			return new Response("origin ok");
		});
		const res = await send("/", {
			ip: "203.0.113.8",
			vars: { MODE: "enforce", TIMEOUT_MS: "20" },
		});
		expect(res.status).toBe(200);
		const h = originCall()!.headers;
		expect(h.get("x-ipscanner-status")).toBe("timeout");
		expect(h.get("x-ipscanner-class")).toBeNull();
	});

	it("forwards with status error when the API fails", async () => {
		ipReply = () => json({ error: "server_error", message: "boom" }, 500);
		const res = await send("/", {
			ip: "203.0.113.9",
			vars: { MODE: "enforce" },
		});
		expect(res.status).toBe(200);
		const h = originCall()!.headers;
		expect(h.get("x-ipscanner-status")).toBe("error");
		expect(h.get("x-ipscanner-risk")).toBeNull();
	});
});

describe("passthrough", () => {
	it("strips spoofed X-IPScanner headers", async () => {
		await send("/", {
			ip: "203.0.113.11",
			vars: { IPSCANNER_API_KEY: "" },
			init: {
				headers: { "X-IPScanner-Class": "human", "X-IPScanner-Risk": "0" },
			},
		});
		const h = originCall()!.headers;
		expect(h.get("x-ipscanner-class")).toBeNull();
		expect(h.get("x-ipscanner-risk")).toBeNull();
		expect(h.get("x-ipscanner-status")).toBe("skipped");
		expect(apiCalls()).toHaveLength(0);
	});

	it("replaces spoofed headers with real verdicts", async () => {
		await send("/", {
			ip: "203.0.113.12",
			init: { headers: { "X-IPScanner-Class": "known_bot" } },
		});
		expect(originCall()!.headers.get("x-ipscanner-class")).toBe("human");
	});

	it("skips static asset paths", async () => {
		const res = await send("/assets/app.css", { ip: "203.0.113.13" });
		expect(res.status).toBe(200);
		expect(apiCalls()).toHaveLength(0);
		expect(originCall()!.headers.get("x-ipscanner-status")).toBe("skipped");
	});

	it("skips OPTIONS requests", async () => {
		await send("/api", { ip: "203.0.113.14", init: { method: "OPTIONS" } });
		expect(apiCalls()).toHaveLength(0);
	});

	it("checks other methods", async () => {
		await send("/api", {
			ip: "203.0.113.15",
			init: { method: "POST", body: "x=1" },
		});
		expect(apiCalls()).toHaveLength(2);
		expect(originCall()!.method).toBe("POST");
		expect(originCall()!.body).toBe("x=1");
	});

	it("runs only the enabled checks", async () => {
		await send("/", { ip: "203.0.113.16", vars: { CHECK_IP: "false" } });
		expect(apiCalls().map((c) => new URL(c.url).pathname)).toEqual([
			"/v1/agentscan/check",
		]);
		expect(originCall()!.headers.get("x-ipscanner-network-class")).toBe(
			"residential_clean",
		);
	});
});

describe("caching", () => {
	it("serves repeat visitors from cache", async () => {
		await send("/", { ip: "203.0.113.17" });
		expect(apiCalls()).toHaveLength(2);
		calls = [];
		await send("/other", { ip: "203.0.113.17" });
		expect(apiCalls()).toHaveLength(0);
		expect(originCall()!.headers.get("x-ipscanner-class")).toBe("human");
	});

	it("does not cache failures", async () => {
		agentReply = () => json({ error: "server_error" }, 500);
		await send("/", { ip: "203.0.113.18" });
		agentReply = () => json(human);
		calls = [];
		await send("/", { ip: "203.0.113.18" });
		expect(apiCalls().map((c) => new URL(c.url).pathname)).toEqual([
			"/v1/agentscan/check",
		]);
	});
});

describe("routing", () => {
	it("forwards to ORIGIN_URL when set", async () => {
		await send("/path?q=1", {
			ip: "203.0.113.19",
			vars: { ORIGIN_URL: "https://backend.example.net" },
		});
		expect(originCall()!.url).toBe("https://backend.example.net/path?q=1");
	});

	it("shows the setup page on workers.dev without an origin", async () => {
		const ctx = createExecutionContext();
		const req = new Request(
			"https://ipscanner-edge-guard-template.example.workers.dev/",
			{ headers: { "CF-Connecting-IP": "203.0.113.20" } },
		);
		const res = await worker.fetch(
			req as Request<unknown, IncomingRequestCfProperties>,
			{ ...env, IPSCANNER_API_KEY: "" },
			ctx,
		);
		await waitOnExecutionContext(ctx);
		const body = await res.text();
		expect(res.status).toBe(200);
		expect(body).toContain("IPScanner edge guard");
		expect(body).toContain("API key missing");
		expect(originCall()).toBeUndefined();
	});
});
