import { type Config, loadConfig } from "./config";
import {
	type AgentResult,
	checkAgent,
	checkEdge,
	type EdgeResult,
	getPolicy,
	type IpResult,
	lookupIp,
	type SitePolicy,
} from "./ipscanner";

const PREFIX = "x-ipscanner-";
const FORWARDED_HEADERS = ["accept", "accept-language", "accept-encoding"];

let warnedNoKey = false;

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function page(status: number, title: string, body: string): Response {
	const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>body{font-family:system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem;line-height:1.5}code{background:#eee;padding:0 .25rem}td{padding:.25rem 1rem .25rem 0}</style></head><body>${body}</body></html>`;
	return new Response(html, {
		status,
		headers: {
			"Content-Type": "text/html; charset=utf-8",
			"Cache-Control": "no-store",
		},
	});
}

function blocked(requestId: string): Response {
	return page(
		403,
		"Blocked",
		`<h1>Access denied</h1><p>Blocked by IPScanner edge guard.</p><p>Request ID: <code>${escapeHtml(requestId)}</code></p>`,
	);
}

function preview(cfg: Config, headers: Headers): Response {
	const rows = [...headers]
		.filter(([k]) => k.startsWith(PREFIX))
		.map(
			([k, v]) =>
				`<tr><td><code>${escapeHtml(k)}</code></td><td>${escapeHtml(v)}</td></tr>`,
		)
		.join("");
	const key = cfg.apiKey
		? "<p>API key: configured.</p>"
		: '<p><strong>API key missing.</strong> Requests pass through unchecked. Get a key at <a href="https://ipscanner.io">ipscanner.io</a> and run <code>npx wrangler secret put IPSCANNER_API_KEY</code>.</p>';
	return page(
		200,
		"IPScanner edge guard",
		`<h1>IPScanner edge guard</h1>${key}${cfg.siteId ? `<p>Site: <code>${escapeHtml(cfg.siteId)}</code></p>` : `<p>Mode: <code>${cfg.enforce ? "enforce" : "monitor"}</code></p>`}<p>No origin is configured. Add a route in front of your site or set <code>ORIGIN_URL</code>. Until then this page shows the headers your origin would receive.</p><table>${rows}</table>`,
	);
}

function isPreviewHost(hostname: string): boolean {
	return (
		hostname.endsWith(".workers.dev") ||
		hostname === "localhost" ||
		hostname === "127.0.0.1" ||
		hostname === "[::1]"
	);
}

function forward(
	request: Request,
	headers: Headers,
	cfg: Config,
	url: URL,
): Promise<Response> | Response {
	if (!cfg.originUrl && isPreviewHost(url.hostname))
		return preview(cfg, headers);
	const target = cfg.originUrl
		? new URL(url.pathname + url.search, cfg.originUrl)
		: url;
	return fetch(new Request(target, new Request(request, { headers })));
}

function agentHeaders(source: Headers): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [k, v] of source) {
		if (
			FORWARDED_HEADERS.includes(k) ||
			k.startsWith("sec-ch-ua") ||
			k.startsWith("sec-fetch-")
		)
			out[k] = v;
	}
	return out;
}

function ja4(request: Request): string | undefined {
	return (
		(request.cf as { botManagement?: { ja4?: string } } | undefined)
			?.botManagement?.ja4 || undefined
	);
}

export function shouldBlock(
	cfg: Config,
	agent?: AgentResult,
	ip?: IpResult,
): boolean {
	if (agent?.signals?.allowlist_verified === true) return false;
	if (
		agent &&
		(agent.action === "block" || cfg.blockClasses.includes(agent.class))
	)
		return true;
	if (!cfg.blockAnonymized) return false;
	if (ip?.networkClass) return MASKING.has(ip.networkClass);
	const origin = agent?.signals?.network_origin;
	if (typeof origin === "string") return MASKING.has(origin);
	return agent?.signals?.anonymized === true;
}

// Hosting and private relays are anonymized too, but BLOCK_ANONYMIZED means
// VPN, proxy and Tor.
const MASKING = new Set(["vpn", "residential_proxy", "tor"]);

export type SiteAction = "allow" | "flag" | "block";

export function siteAction(
	verdict: EdgeResult,
	policy: SitePolicy | null,
): SiteAction {
	if (!policy) return "allow";
	if (
		verdict.class === "verified_bot" ||
		verdict.agent?.signals?.allowlist_verified === true
	)
		return "allow";
	const action = policy.policy[verdict.class];
	return action === "block" || action === "flag" ? action : "allow";
}

async function checkSite(
	request: Request,
	headers: Headers,
	cfg: Config,
	ctx: ExecutionContext,
	url: URL,
	ip: string,
): Promise<Response> {
	const requestId = request.headers.get("cf-ray") ?? crypto.randomUUID();
	// One budget for the whole check: the verdict and the policy load in
	// parallel and both abort at TIMEOUT_MS.
	const signal = AbortSignal.timeout(cfg.timeoutMs);
	const [outcome, policy] = await Promise.all([
		checkEdge(
			cfg,
			ctx,
			{
				ip,
				userAgent: request.headers.get("user-agent") ?? "",
				ja4: ja4(request),
				headers: agentHeaders(request.headers),
				requestId,
			},
			signal,
		),
		getPolicy(cfg, ctx, signal),
	]);

	if (!outcome.ok) {
		headers.set("X-IPScanner-Status", outcome.status);
		console.log(
			JSON.stringify({
				ip,
				path: url.pathname,
				site: cfg.siteId,
				status: outcome.status,
				decision: "allow",
			}),
		);
		return forward(request, headers, cfg, url);
	}

	const verdict = outcome.data;
	const agent = verdict.agent ?? undefined;
	const network = verdict.network ?? undefined;
	const networkClass =
		network?.networkClass ??
		(agent?.signals?.network_origin as string | undefined);
	const anonymized =
		network?.anonymized === true || agent?.signals?.anonymized === true;

	if (agent) {
		headers.set("X-IPScanner-Class", agent.class);
		headers.set("X-IPScanner-Action", agent.action);
		headers.set("X-IPScanner-Confidence", String(agent.confidence));
	}
	if (networkClass) headers.set("X-IPScanner-Network-Class", networkClass);
	headers.set("X-IPScanner-Anonymized", String(anonymized));
	if (typeof network?.riskScore === "number")
		headers.set("X-IPScanner-Risk", String(network.riskScore));
	if (network?.country) headers.set("X-IPScanner-Country", network.country);
	if (verdict.class) headers.set("X-IPScanner-Traffic-Class", verdict.class);
	headers.set("X-IPScanner-Site", cfg.siteId);
	headers.set("X-IPScanner-Status", "ok");

	const action = siteAction(verdict, policy.policy);
	const enforce = policy.policy?.mode === "enforce";
	const decision =
		action === "allow" ? "allow" : enforce ? action : `would_${action}`;
	if (decision === "flag") headers.set("X-IPScanner-Action", "flag");
	console.log(
		JSON.stringify({
			ip,
			path: url.pathname,
			site: cfg.siteId,
			trafficClass: verdict.class,
			class: agent?.class,
			action: agent?.action,
			networkClass,
			decision,
			policy: { source: policy.source, version: policy.policy?.version },
			cache: { edge: outcome.cached ? "hit" : "miss" },
		}),
	);

	if (decision === "block") return blocked(requestId);
	return forward(request, headers, cfg, url);
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const cfg = loadConfig(env);
		const url = new URL(request.url);
		const headers = new Headers(request.headers);
		for (const key of [...headers.keys()]) {
			if (key.startsWith(PREFIX)) headers.delete(key);
		}

		if (!cfg.apiKey && !warnedNoKey) {
			warnedNoKey = true;
			console.log(
				JSON.stringify({
					ipscanner:
						"IPSCANNER_API_KEY is not set, passing requests through unchecked",
				}),
			);
		}

		const ip = request.headers.get("cf-connecting-ip") ?? "";
		const skip =
			!cfg.apiKey ||
			!ip ||
			request.method === "OPTIONS" ||
			(!cfg.siteId && !cfg.checkAgent && !cfg.checkIp) ||
			cfg.skipPaths?.test(url.pathname);
		if (skip) {
			headers.set("X-IPScanner-Status", "skipped");
			return forward(request, headers, cfg, url);
		}

		if (cfg.siteId) return checkSite(request, headers, cfg, ctx, url, ip);

		const requestId = request.headers.get("cf-ray") ?? crypto.randomUUID();
		const [agentOutcome, ipOutcome] = await Promise.all([
			cfg.checkAgent
				? checkAgent(cfg, ctx, {
						ip,
						userAgent: request.headers.get("user-agent") ?? "",
						ja4: ja4(request),
						headers: agentHeaders(request.headers),
						requestId,
					})
				: undefined,
			cfg.checkIp ? lookupIp(cfg, ctx, ip) : undefined,
		]);

		const failure = [agentOutcome, ipOutcome].find((o) => o && !o.ok);
		if (failure && !failure.ok) {
			headers.set("X-IPScanner-Status", failure.status);
			console.log(
				JSON.stringify({
					ip,
					path: url.pathname,
					status: failure.status,
					decision: "allow",
				}),
			);
			return forward(request, headers, cfg, url);
		}

		const agent = agentOutcome?.ok ? agentOutcome.data : undefined;
		const lookup = ipOutcome?.ok ? ipOutcome.data : undefined;
		const networkClass =
			lookup?.networkClass ??
			(agent?.signals?.network_origin as string | undefined);
		const anonymized =
			lookup?.verdict?.anonymized === true ||
			agent?.signals?.anonymized === true;

		if (agent) {
			headers.set("X-IPScanner-Class", agent.class);
			headers.set("X-IPScanner-Action", agent.action);
			headers.set("X-IPScanner-Confidence", String(agent.confidence));
		}
		if (networkClass) headers.set("X-IPScanner-Network-Class", networkClass);
		headers.set("X-IPScanner-Anonymized", String(anonymized));
		if (lookup) headers.set("X-IPScanner-Risk", String(lookup.riskScore));
		if (lookup?.geo?.countryCode)
			headers.set("X-IPScanner-Country", lookup.geo.countryCode);
		headers.set("X-IPScanner-Status", "ok");

		const block = shouldBlock(cfg, agent, lookup);
		const decision = block ? (cfg.enforce ? "block" : "would_block") : "allow";
		console.log(
			JSON.stringify({
				ip,
				path: url.pathname,
				class: agent?.class,
				action: agent?.action,
				networkClass,
				decision,
				cache: {
					agent: agentOutcome?.ok
						? agentOutcome.cached
							? "hit"
							: "miss"
						: undefined,
					ip: ipOutcome?.ok ? (ipOutcome.cached ? "hit" : "miss") : undefined,
				},
			}),
		);

		if (block && cfg.enforce) return blocked(requestId);
		return forward(request, headers, cfg, url);
	},
} satisfies ExportedHandler<Env>;
