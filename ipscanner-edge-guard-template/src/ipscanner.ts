import type { Config } from "./config";

export interface AgentResult {
	class: string;
	confidence: number;
	action: string;
	signals: Record<string, unknown>;
}

export interface IpResult {
	networkClass: string;
	riskScore: number;
	verdict: { classification: string; anonymized: boolean; confidence: number };
	geo?: { countryCode?: string };
}

export interface AgentInput {
	ip: string;
	userAgent: string;
	ja4?: string;
	headers: Record<string, string>;
	requestId?: string;
}

export type Outcome<T> =
	| { ok: true; data: T; cached: boolean }
	| { ok: false; status: "error" | "timeout" };

const CACHE_HOST = "https://ipscanner-cache.invalid";
const USER_AGENT = "ipscanner-cloudflare/0.1.0";

async function sha256(input: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(input),
	);
	return [...new Uint8Array(digest)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

async function post<T>(cfg: Config, path: string, body: unknown): Promise<T> {
	const res = await fetch(`${cfg.apiUrl}${path}`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${cfg.apiKey}`,
			"Content-Type": "application/json",
			Accept: "application/json",
			"User-Agent": USER_AGENT,
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(cfg.timeoutMs),
	});
	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new Error(`ipscanner ${path} ${res.status} ${text.slice(0, 200)}`);
	}
	return (await res.json()) as T;
}

async function cached<T>(
	ctx: ExecutionContext,
	key: string,
	ttl: number,
	load: () => Promise<T>,
): Promise<Outcome<T>> {
	const cache = caches.default;
	const cacheKey = new Request(`${CACHE_HOST}${key}`);
	try {
		const hit = await cache.match(cacheKey);
		if (hit) return { ok: true, data: (await hit.json()) as T, cached: true };
	} catch {}
	try {
		const data = await load();
		const entry = new Response(JSON.stringify(data), {
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": `max-age=${ttl}`,
			},
		});
		ctx.waitUntil(cache.put(cacheKey, entry).catch(() => {}));
		return { ok: true, data, cached: false };
	} catch (err) {
		const name = (err as Error)?.name;
		const status =
			name === "TimeoutError" || name === "AbortError" ? "timeout" : "error";
		console.log(
			JSON.stringify({
				ipscanner: "upstream failure",
				key: key.split("/")[1],
				status,
				message: String(err),
			}),
		);
		return { ok: false, status };
	}
}

export async function checkAgent(
	cfg: Config,
	ctx: ExecutionContext,
	input: AgentInput,
): Promise<Outcome<AgentResult>> {
	const key = `/agent/${await sha256(`${input.ip}|${input.userAgent}`)}`;
	return cached(ctx, key, cfg.agentTtl, () =>
		post<AgentResult>(cfg, "/v1/agentscan/check", {
			ip: input.ip,
			user_agent: input.userAgent,
			ja4: input.ja4,
			headers: input.headers,
			request_id: input.requestId,
		}),
	);
}

export async function lookupIp(
	cfg: Config,
	ctx: ExecutionContext,
	ip: string,
): Promise<Outcome<IpResult>> {
	return cached(ctx, `/ip/${encodeURIComponent(ip)}`, cfg.ipTtl, () =>
		post<IpResult>(cfg, "/v1/ip/lookup", { target: ip }),
	);
}
