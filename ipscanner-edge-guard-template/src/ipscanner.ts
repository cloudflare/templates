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

export interface EdgeNetwork {
	networkClass?: string;
	anonymized?: boolean;
	riskScore?: number;
	provider?: string;
	country?: string;
	asn?: number;
	asnName?: string;
}

export interface EdgeResult {
	class: string;
	agent?: AgentResult | null;
	network?: EdgeNetwork | null;
	site?: { id: string; mode: string; policyVersion: number } | null;
}

export interface SitePolicy {
	mode: "monitor" | "enforce";
	policy: Record<string, string>;
	version: number;
}

export type PolicySource = "memo" | "cache" | "fetch" | "stale" | "none";

export type Outcome<T> =
	| { ok: true; data: T; cached: boolean }
	| { ok: false; status: "error" | "timeout" };

const CACHE_HOST = "https://ipscanner-cache.invalid";
export const VERSION = "0.3.1";
const USER_AGENT = `ipscanner-cloudflare/${VERSION}`;

async function sha256(input: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(input),
	);
	return [...new Uint8Array(digest)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

class ApiError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
	}
}

async function call<T>(
	cfg: Config,
	method: "GET" | "POST",
	path: string,
	body: unknown,
	signal: AbortSignal,
): Promise<T> {
	const res = await fetch(`${cfg.apiUrl}${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${cfg.apiKey}`,
			...(body === undefined ? {} : { "Content-Type": "application/json" }),
			Accept: "application/json",
			"User-Agent": USER_AGENT,
			"X-IPScanner-Source": "cloudflare_worker",
		},
		body: body === undefined ? undefined : JSON.stringify(body),
		signal,
	});
	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new ApiError(
			res.status,
			`ipscanner ${path} ${res.status} ${text.slice(0, 200)}`,
		);
	}
	return (await res.json()) as T;
}

function post<T>(cfg: Config, path: string, body: unknown): Promise<T> {
	return call<T>(cfg, "POST", path, body, AbortSignal.timeout(cfg.timeoutMs));
}

function failureStatus(err: unknown): "error" | "timeout" {
	const name = (err as Error)?.name;
	return name === "TimeoutError" || name === "AbortError" ? "timeout" : "error";
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
		const status = failureStatus(err);
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

export async function checkEdge(
	cfg: Config,
	ctx: ExecutionContext,
	input: AgentInput,
	signal: AbortSignal,
): Promise<Outcome<EdgeResult>> {
	const hash = await sha256(`${cfg.siteId}|${input.ip}|${input.userAgent}`);
	const key = `/edge/${hash}`;
	return cached(ctx, key, cfg.agentTtl, () =>
		call<EdgeResult>(
			cfg,
			"POST",
			"/v1/edge/check",
			{
				site: cfg.siteId,
				ip: input.ip,
				user_agent: input.userAgent,
				ja4: input.ja4,
				headers: input.headers,
				request_id: input.requestId,
			},
			signal,
		),
	);
}

interface PolicyEntry {
	policy: SitePolicy | null;
	fetchedAt: number;
}

interface PolicyResponse {
	mode?: string;
	policy?: Record<string, string> | null;
	version?: number;
}

const STALE_SECONDS = 86_400;
const RETRY_SECONDS = 5;
const policyMemo = new Map<string, PolicyEntry>();
const policyRetryAt = new Map<string, number>();

export function clearPolicyMemo(): void {
	policyMemo.clear();
	policyRetryAt.clear();
}

function toPolicy(data: PolicyResponse): SitePolicy {
	return {
		mode: data.mode === "enforce" ? "enforce" : "monitor",
		policy:
			data.policy && typeof data.policy === "object" ? { ...data.policy } : {},
		version: Number(data.version) || 0,
	};
}

function isEntry(value: unknown): value is PolicyEntry {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as PolicyEntry).fetchedAt === "number" &&
		"policy" in value
	);
}

// Policy lookup order: isolate memo, then Cache API, then the API. Entries
// younger than POLICY_TTL are fresh. When a fetch fails, the newest entry
// younger than 24h is used and the isolate waits a few seconds before the
// next attempt. A 404 means the site has no policy.
export async function getPolicy(
	cfg: Config,
	ctx: ExecutionContext,
	signal: AbortSignal,
): Promise<{ policy: SitePolicy | null; source: PolicySource }> {
	const now = Date.now();
	const fresh = (e: PolicyEntry) => now - e.fetchedAt < cfg.policyTtl * 1000;
	const usable = (e: PolicyEntry) => now - e.fetchedAt < STALE_SECONDS * 1000;

	const memo = policyMemo.get(cfg.siteId);
	if (memo && fresh(memo)) return { policy: memo.policy, source: "memo" };

	const cache = caches.default;
	const cacheKey = new Request(
		`${CACHE_HOST}/policy/${encodeURIComponent(cfg.siteId)}`,
	);
	let stored: PolicyEntry | undefined;
	try {
		const hit = await cache.match(cacheKey);
		const value: unknown = hit ? await hit.json() : undefined;
		if (isEntry(value)) stored = value;
	} catch {}
	if (stored && fresh(stored)) {
		policyMemo.set(cfg.siteId, stored);
		return { policy: stored.policy, source: "cache" };
	}

	const save = (entry: PolicyEntry) => {
		policyMemo.set(cfg.siteId, entry);
		const body = new Response(JSON.stringify(entry), {
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": `max-age=${STALE_SECONDS}`,
			},
		});
		ctx.waitUntil(cache.put(cacheKey, body).catch(() => {}));
	};

	const fallback = (): { policy: SitePolicy | null; source: PolicySource } => {
		const a = memo && usable(memo) ? memo : undefined;
		const b = stored && usable(stored) ? stored : undefined;
		const last = a && b ? (a.fetchedAt >= b.fetchedAt ? a : b) : (a ?? b);
		if (last?.policy) return { policy: last.policy, source: "stale" };
		return { policy: null, source: "none" };
	};

	if ((policyRetryAt.get(cfg.siteId) ?? 0) > now) return fallback();

	try {
		const data = await call<PolicyResponse>(
			cfg,
			"GET",
			`/v1/sites/${encodeURIComponent(cfg.siteId)}/policy`,
			undefined,
			signal,
		);
		const entry = { policy: toPolicy(data), fetchedAt: Date.now() };
		policyRetryAt.delete(cfg.siteId);
		save(entry);
		return { policy: entry.policy, source: "fetch" };
	} catch (err) {
		if (err instanceof ApiError && err.status === 404) {
			policyRetryAt.delete(cfg.siteId);
			save({ policy: null, fetchedAt: Date.now() });
			return { policy: null, source: "none" };
		}
		console.log(
			JSON.stringify({
				ipscanner: "upstream failure",
				key: "policy",
				status: failureStatus(err),
				message: String(err),
			}),
		);
		policyRetryAt.set(
			cfg.siteId,
			now + Math.min(cfg.policyTtl, RETRY_SECONDS) * 1000,
		);
		return fallback();
	}
}
