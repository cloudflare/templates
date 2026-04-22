/**
 * Agent Commerce Analytics Worker
 *
 * Merchant-facing analytics for AI shopping agents. Tracks the full
 * discover → browse → purchase journey per agent, payment network, and
 * verification status, and exposes both JSON dashboard endpoints and a
 * React SPA at `/` that renders them visually.
 *
 * Events are stored in KV (EVENT_STORE). KV is required — no in-memory
 * fallback — so the deployed dashboard survives Worker isolate churn and
 * behaves the same locally (via Miniflare) as in production.
 *
 * Endpoints:
 *   GET  /api                  — API documentation
 *   GET  /api/dashboard        — Full analytics summary (JSON)
 *   GET  /api/dashboard/funnel — Discovery → purchase funnel
 *   GET  /api/dashboard/agents — Agent profiles
 *   GET  /api/dashboard/products — Product performance
 *   POST /api/events           — Record a single event
 *   POST /api/events/batch     — Record multiple events
 *   POST /api/events/from-headers — Record an event from cf-agent-* headers
 *   DELETE /api/events         — Clear all events (development helper)
 *
 *   GET  /                     — React SPA (Workers Static Assets)
 */

import { Hono } from "hono";
import type { AgentEvent, Env } from "../lib/types";
import {
	clearEvents,
	classifyAction,
	computeSummary,
	extractProductSlug,
	loadEvents,
	MAX_BATCH_EVENTS,
	recordEvent,
	recordEventBatch,
	seedDemoDataIfNeeded,
} from "../lib/store";

const app = new Hono<{ Bindings: Env }>();

// Per-isolate cache of the SEED_DEMO_DATA-disabled decision so the common
// production path (seed disabled) pays zero KV cost per request.
let seedDisabledInIsolate: boolean | null = null;

function merchantName(env: Env): string {
	return env.MERCHANT_NAME || "My Store";
}

async function maybeSeed(env: Env): Promise<void> {
	if (seedDisabledInIsolate === null) {
		seedDisabledInIsolate =
			(env.SEED_DEMO_DATA ?? "true").toLowerCase() === "false";
	}
	if (seedDisabledInIsolate) return;
	// When seed is enabled, ask the store — `seedDemoDataIfNeeded` does a
	// single KV `get` on the marker key and returns immediately if already
	// seeded. That's the right cost on the dev/demo path.
	await seedDemoDataIfNeeded(env.EVENT_STORE, env);
}

// Seed demo data on demand from routes that care (dashboard reads, event
// ingestion). `/api` and static-asset fallthroughs don't pay for the seed.

// ---------------------------------------------------------------------------
// /api — service documentation
// ---------------------------------------------------------------------------

app.get("/api", (c) => {
	return c.json({
		service: "Agent Commerce Analytics",
		merchant: merchantName(c.env),
		description:
			"Merchant-facing analytics for AI shopping agent interactions. Tracks discovery (/llms.txt reads), browsing (product views), and purchase (checkout attempts) across verified and unverified agents, with auto-generated insights and a React dashboard at /.",
		endpoints: {
			"GET /": "React SPA dashboard",
			"GET /api": "Service documentation (this response)",
			"GET /api/dashboard": "Full analytics summary (JSON)",
			"GET /api/dashboard/funnel": "Discovery-to-purchase funnel",
			"GET /api/dashboard/agents": "Agent profiles",
			"GET /api/dashboard/products": "Product performance",
			"POST /api/events": "Record a single agent event",
			"POST /api/events/batch": "Record multiple events",
			"POST /api/events/from-headers":
				"Record an event from cf-agent-* headers",
			"DELETE /api/events": "Clear all events (development helper)",
		},
		buildsOn: [
			"Radar AI Insights — global AI bot traffic patterns",
			"Zone Analytics — HTTP traffic with bot score filtering",
			"AI Gateway — observability for model calls",
		],
		whatIsNew:
			"Commerce-specific analytics: which agents discover your products, which products they recommend, and whether visits convert to purchases.",
	});
});

// ---------------------------------------------------------------------------
// Dashboard endpoints
// ---------------------------------------------------------------------------

app.get("/api/dashboard", async (c) => {
	await maybeSeed(c.env);
	const events = await loadEvents(c.env.EVENT_STORE);
	return c.json(computeSummary(events, merchantName(c.env)));
});

app.get("/api/dashboard/funnel", async (c) => {
	await maybeSeed(c.env);
	const events = await loadEvents(c.env.EVENT_STORE);
	return c.json(computeSummary(events, merchantName(c.env)).funnel);
});

app.get("/api/dashboard/agents", async (c) => {
	await maybeSeed(c.env);
	const events = await loadEvents(c.env.EVENT_STORE);
	return c.json(computeSummary(events, merchantName(c.env)).agentBreakdown);
});

app.get("/api/dashboard/products", async (c) => {
	await maybeSeed(c.env);
	const events = await loadEvents(c.env.EVENT_STORE);
	return c.json(computeSummary(events, merchantName(c.env)).topProducts);
});

// ---------------------------------------------------------------------------
// Event ingestion
// ---------------------------------------------------------------------------

app.post("/api/events", async (c) => {
	try {
		const event = await c.req.json<AgentEvent>();
		if (!event.timestamp || !event.action) {
			return c.json({ error: "event must include timestamp and action" }, 400);
		}
		await recordEvent(c.env.EVENT_STORE, c.env, event);
		return c.json({ success: true });
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}
});

app.post("/api/events/batch", async (c) => {
	try {
		const batch = await c.req.json<AgentEvent[]>();
		if (!Array.isArray(batch)) {
			return c.json({ error: "Body must be an array of events" }, 400);
		}
		if (batch.length > MAX_BATCH_EVENTS) {
			return c.json(
				{
					error: `Batch too large — maximum ${MAX_BATCH_EVENTS} events per request.`,
				},
				413,
			);
		}
		const added = await recordEventBatch(c.env.EVENT_STORE, c.env, batch);
		return c.json({ success: true, added });
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}
});

/**
 * Middleware-style ingestion. Accepts the same cf-agent-* headers a
 * Managed Ruleset would inject on a verified agent request. Lets a
 * merchant hook this Worker into their existing stack as a service
 * binding or webhook without custom glue code.
 */
app.post("/api/events/from-headers", async (c) => {
	try {
		const body = await c.req.json<{
			path: string;
			statusCode?: number;
			searchQuery?: string;
		}>();
		if (!body.path) {
			return c.json({ error: "Body must include a path" }, 400);
		}
		const event: AgentEvent = {
			timestamp: new Date().toISOString(),
			agentId: c.req.header("cf-agent-id") ?? null,
			agentName: c.req.header("cf-agent-name") ?? null,
			agentNetwork: c.req.header("cf-agent-network") ?? null,
			verified: c.req.header("cf-agent-verified") === "true",
			action: classifyAction(body.path, c.req.header("cf-agent-intent")),
			path: body.path,
			productSlug: extractProductSlug(body.path),
			searchQuery: body.searchQuery ?? null,
			statusCode: body.statusCode ?? 200,
		};
		await recordEvent(c.env.EVENT_STORE, c.env, event);
		return c.json({ success: true, event });
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}
});

/**
 * Clear all stored events. Gated behind the optional `ADMIN_TOKEN` secret:
 * if it's set, the caller must present the same value in the `x-admin-token`
 * header. If it's unset (default), the endpoint is disabled entirely.
 *
 * Set `ADMIN_TOKEN` with `wrangler secret put ADMIN_TOKEN` for production
 * use, or leave it unset if you never want external clearing of the store.
 */
app.delete("/api/events", async (c) => {
	const expected = c.env.ADMIN_TOKEN;
	if (!expected) {
		return c.json(
			{
				error:
					"DELETE /api/events is disabled. Set the ADMIN_TOKEN secret (wrangler secret put ADMIN_TOKEN) and pass it in the x-admin-token header to enable.",
			},
			403,
		);
	}
	if (c.req.header("x-admin-token") !== expected) {
		return c.json({ error: "Missing or invalid x-admin-token header" }, 403);
	}
	const cleared = await clearEvents(c.env.EVENT_STORE);
	return c.json({ success: true, cleared });
});

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------

app.onError((err, c) => {
	console.error("[analytics] Unhandled error:", err);
	return c.json({ error: "Internal server error" }, 500);
});

export default app;
