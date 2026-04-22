/**
 * Agent event storage and analytics computation.
 *
 * Events are stored in KV. Each event lives under a key like
 * `event:<reversed-timestamp>:<random>` so that a prefix list returns events
 * in reverse-chronological order (newest first) without a sort step.
 * `EVENT_RETENTION_DAYS` controls per-event TTL.
 *
 * On read, the worker lists the most-recent event keys and fetches them in
 * parallel. For the volume targeted by this template (a single merchant's
 * agent traffic) KV is a fine primary store; production deployments with
 * higher event rates should move to Analytics Engine or a log pipeline.
 */

import type {
	AgentAnalyticsSummary,
	AgentAction,
	AgentEvent,
	AgentJourney,
	AgentProfile,
	ContentQualityMetrics,
	DemandSignals,
	FunnelMetrics,
	Insight,
	JourneyStep,
	NetworkMetrics,
	ProductAnalytics,
	QueryOutcome,
	RevenueMetrics,
	SecurityEvent,
	SecurityMetrics,
} from "./types";

// Product catalog used for display names and revenue estimation. Matches
// the sample catalog from the commerce-llms-txt-template so analytics
// feel like they're coming from a real store out of the box.
const PRODUCT_NAMES: Record<string, string> = {
	"little-ripper-toddler-skis": "Little Ripper Toddler Ski Set",
	"mountain-cub-jacket": "Mountain Cub Insulated Jacket",
	"powder-pup-snow-pants": "Powder Pup Snow Pants",
	"mini-shred-helmet": "Mini Shred Kids Ski Helmet",
	"little-stomper-ski-boots": "Little Stomper Ski Boots",
	"summit-shield-goggles": "Summit Shield Kids Goggles",
	"bunny-ears-ski-gloves": "Bunny Ears Insulated Ski Mittens",
	"cozy-cub-base-layer": "Cozy Cub Merino Base Layer Set",
	"yeti-steps-ski-socks": "Yeti Steps Ski Socks (2-Pack)",
};

const PRODUCT_PRICES: Record<string, number> = {
	"little-ripper-toddler-skis": 89.99,
	"mountain-cub-jacket": 64.99,
	"powder-pup-snow-pants": 49.99,
	"mini-shred-helmet": 54.99,
	"little-stomper-ski-boots": 74.99,
	"summit-shield-goggles": 29.99,
	"bunny-ears-ski-gloves": 24.99,
	"cozy-cub-base-layer": 39.99,
	"yeti-steps-ski-socks": 18.99,
};

const EVENT_KEY_PREFIX = "event:";
const SEED_MARKER_KEY = "meta:seeded";
const DEFAULT_RETENTION_DAYS = 30;
const MAX_EVENTS_FETCHED = 1000;
// Long marker TTL (10 years) so the demo seed doesn't silently re-run on a
// live merchant store after the events themselves have aged out of KV.
const SEED_MARKER_TTL_SECONDS = 10 * 365 * 24 * 60 * 60;
// KV subrequest limit per request is 1000 in the default Workers plan; cap
// parallel writes/deletes well below that so a single batch call can't
// exhaust it.
const KV_PARALLEL_CAP = 50;
export const MAX_BATCH_EVENTS = 500;

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function eventKey(timestamp: string): string {
	// Reversed-time prefix so `list()` returns most recent first.
	const reversed = (9999999999999 - new Date(timestamp).getTime())
		.toString()
		.padStart(13, "0");
	const random = Math.random().toString(36).slice(2, 10);
	return `${EVENT_KEY_PREFIX}${reversed}:${random}`;
}

function retentionSeconds(env: { EVENT_RETENTION_DAYS?: string }): number {
	const days = parseInt(
		env.EVENT_RETENTION_DAYS || String(DEFAULT_RETENTION_DAYS),
		10,
	);
	return Math.max(1, days) * 24 * 60 * 60;
}

export async function recordEvent(
	store: KVNamespace,
	env: { EVENT_RETENTION_DAYS?: string },
	event: AgentEvent,
): Promise<void> {
	await store.put(eventKey(event.timestamp), JSON.stringify(event), {
		expirationTtl: retentionSeconds(env),
	});
}

async function runInChunks<T>(
	items: T[],
	size: number,
	fn: (item: T) => Promise<unknown>,
): Promise<void> {
	for (let i = 0; i < items.length; i += size) {
		await Promise.all(items.slice(i, i + size).map(fn));
	}
}

export async function recordEventBatch(
	store: KVNamespace,
	env: { EVENT_RETENTION_DAYS?: string },
	events: AgentEvent[],
): Promise<number> {
	// KV has no native batch; parallelise the writes in capped chunks so a
	// single batch call can't exhaust the Worker's subrequest budget.
	await runInChunks(events, KV_PARALLEL_CAP, (e) => recordEvent(store, env, e));
	return events.length;
}

export async function loadEvents(store: KVNamespace): Promise<AgentEvent[]> {
	// Most-recent-first thanks to the reversed-time prefix.
	const list = await store.list({
		prefix: EVENT_KEY_PREFIX,
		limit: MAX_EVENTS_FETCHED,
	});
	if (list.keys.length === 0) return [];

	const values = await Promise.all(
		list.keys.map((k) => store.get(k.name, "json")),
	);

	const events: AgentEvent[] = [];
	for (const value of values) {
		if (value) events.push(value as AgentEvent);
	}
	return events;
}

export async function clearEvents(store: KVNamespace): Promise<number> {
	let cursor: string | undefined;
	let cleared = 0;
	do {
		const list = await store.list({ prefix: EVENT_KEY_PREFIX, cursor });
		// Chunked deletes so a full page of ~1000 keys doesn't exhaust the
		// Worker's subrequest budget in one go.
		await runInChunks(list.keys, KV_PARALLEL_CAP, (k) => store.delete(k.name));
		cleared += list.keys.length;
		cursor = list.list_complete ? undefined : list.cursor;
	} while (cursor);
	// Keep the seed marker in place so the next request doesn't re-seed demo
	// data immediately after the merchant has cleared the store. Re-enabling
	// the demo data requires explicitly deleting the marker key or resetting
	// the KV namespace.
	return cleared;
}

// ---------------------------------------------------------------------------
// Demo data seeding
// ---------------------------------------------------------------------------

/**
 * Seed the KV store with realistic demo traffic so the deployed dashboard
 * is immediately populated. The seed runs at most once — a marker key in
 * KV tracks whether seeding has happened. If `SEED_DEMO_DATA` is set to a
 * falsy value we skip this entirely.
 */
export async function seedDemoDataIfNeeded(
	store: KVNamespace,
	env: { SEED_DEMO_DATA?: string; EVENT_RETENTION_DAYS?: string },
): Promise<void> {
	const seedEnabled = (env.SEED_DEMO_DATA ?? "true").toLowerCase() !== "false";
	if (!seedEnabled) return;

	const already = await store.get(SEED_MARKER_KEY);
	if (already) return;

	const ts = (minutesAgo: number): string =>
		new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();

	const seed: AgentEvent[] = [
		// --- BuyBot (Visa) — the ski trip ---
		{
			timestamp: ts(180),
			agentId: "visa:BuyBot-abc123",
			agentName: "BuyBot Shopping Agent",
			agentNetwork: "visa",
			verified: true,
			action: "llms_txt_concise",
			path: "/llms.txt",
			productSlug: null,
			searchQuery: "toddler ski gear beginner lightweight",
			statusCode: 200,
		},
		{
			timestamp: ts(179),
			agentId: "visa:BuyBot-abc123",
			agentName: "BuyBot Shopping Agent",
			agentNetwork: "visa",
			verified: true,
			action: "product_detail",
			path: "/api/products/little-ripper-toddler-skis",
			productSlug: "little-ripper-toddler-skis",
			searchQuery: null,
			statusCode: 200,
		},
		{
			timestamp: ts(178),
			agentId: "visa:BuyBot-abc123",
			agentName: "BuyBot Shopping Agent",
			agentNetwork: "visa",
			verified: true,
			action: "product_detail",
			path: "/api/products/mini-shred-helmet",
			productSlug: "mini-shred-helmet",
			searchQuery: null,
			statusCode: 200,
		},
		{
			timestamp: ts(177),
			agentId: "visa:BuyBot-abc123",
			agentName: "BuyBot Shopping Agent",
			agentNetwork: "visa",
			verified: true,
			action: "product_detail",
			path: "/api/products/little-stomper-ski-boots",
			productSlug: "little-stomper-ski-boots",
			searchQuery: null,
			statusCode: 200,
		},
		{
			timestamp: ts(176),
			agentId: "visa:BuyBot-abc123",
			agentName: "BuyBot Shopping Agent",
			agentNetwork: "visa",
			verified: true,
			action: "checkout_attempt",
			path: "/api/checkout/initiate",
			productSlug: "little-ripper-toddler-skis",
			searchQuery: null,
			statusCode: 200,
		},
		{
			timestamp: ts(176),
			agentId: "visa:BuyBot-abc123",
			agentName: "BuyBot Shopping Agent",
			agentNetwork: "visa",
			verified: true,
			action: "checkout_attempt",
			path: "/api/checkout/initiate",
			productSlug: "mini-shred-helmet",
			searchQuery: null,
			statusCode: 200,
		},
		{
			timestamp: ts(176),
			agentId: "visa:BuyBot-abc123",
			agentName: "BuyBot Shopping Agent",
			agentNetwork: "visa",
			verified: true,
			action: "checkout_attempt",
			path: "/api/checkout/initiate",
			productSlug: "little-stomper-ski-boots",
			searchQuery: null,
			statusCode: 200,
		},

		// --- ShopAssist (Mastercard) — comparison shopper who needed full llms.txt ---
		{
			timestamp: ts(150),
			agentId: "mastercard:ShopAssist-def456",
			agentName: "ShopAssist AI",
			agentNetwork: "mastercard",
			verified: true,
			action: "llms_txt_concise",
			path: "/llms.txt",
			productSlug: null,
			searchQuery: "kids ski equipment comparison",
			statusCode: 200,
		},
		{
			timestamp: ts(149),
			agentId: "mastercard:ShopAssist-def456",
			agentName: "ShopAssist AI",
			agentNetwork: "mastercard",
			verified: true,
			action: "llms_txt_full",
			path: "/llms-full.txt",
			productSlug: null,
			searchQuery: null,
			statusCode: 200,
		},
		{
			timestamp: ts(148),
			agentId: "mastercard:ShopAssist-def456",
			agentName: "ShopAssist AI",
			agentNetwork: "mastercard",
			verified: true,
			action: "product_detail",
			path: "/api/products/little-ripper-toddler-skis",
			productSlug: "little-ripper-toddler-skis",
			searchQuery: null,
			statusCode: 200,
		},

		// --- PriceScout (unverified) — blocked at checkout ---
		{
			timestamp: ts(120),
			agentId: null,
			agentName: "PriceScout",
			agentNetwork: null,
			verified: false,
			action: "llms_txt_concise",
			path: "/llms.txt",
			productSlug: null,
			searchQuery: "cheapest toddler skis",
			statusCode: 200,
		},
		{
			timestamp: ts(119),
			agentId: null,
			agentName: "PriceScout",
			agentNetwork: null,
			verified: false,
			action: "product_detail",
			path: "/api/products/little-ripper-toddler-skis",
			productSlug: "little-ripper-toddler-skis",
			searchQuery: null,
			statusCode: 200,
		},
		{
			timestamp: ts(118),
			agentId: null,
			agentName: "PriceScout",
			agentNetwork: null,
			verified: false,
			action: "checkout_attempt",
			path: "/api/checkout/initiate",
			productSlug: "little-ripper-toddler-skis",
			searchQuery: null,
			statusCode: 403,
		},

		// --- GearFinder (Visa) — multi-product purchase ---
		{
			timestamp: ts(90),
			agentId: "visa:GearFinder-ghi789",
			agentName: "GearFinder Pro",
			agentNetwork: "visa",
			verified: true,
			action: "llms_txt_concise",
			path: "/llms.txt",
			productSlug: null,
			searchQuery: "winter outfit toddler ski trip",
			statusCode: 200,
		},
		{
			timestamp: ts(89),
			agentId: "visa:GearFinder-ghi789",
			agentName: "GearFinder Pro",
			agentNetwork: "visa",
			verified: true,
			action: "product_detail",
			path: "/api/products/mountain-cub-jacket",
			productSlug: "mountain-cub-jacket",
			searchQuery: null,
			statusCode: 200,
		},
		{
			timestamp: ts(88),
			agentId: "visa:GearFinder-ghi789",
			agentName: "GearFinder Pro",
			agentNetwork: "visa",
			verified: true,
			action: "product_detail",
			path: "/api/products/powder-pup-snow-pants",
			productSlug: "powder-pup-snow-pants",
			searchQuery: null,
			statusCode: 200,
		},
		{
			timestamp: ts(87),
			agentId: "visa:GearFinder-ghi789",
			agentName: "GearFinder Pro",
			agentNetwork: "visa",
			verified: true,
			action: "checkout_attempt",
			path: "/api/checkout/initiate",
			productSlug: "powder-pup-snow-pants",
			searchQuery: null,
			statusCode: 200,
		},

		// --- DealHunter (Mastercard) — product gap signal ---
		{
			timestamp: ts(60),
			agentId: "mastercard:DealHunter-jkl012",
			agentName: "DealHunter",
			agentNetwork: "mastercard",
			verified: true,
			action: "llms_txt_concise",
			path: "/llms.txt",
			productSlug: null,
			searchQuery: "snowboard toddler",
			statusCode: 200,
		},

		// --- BuyBot returns (repeat customer) ---
		{
			timestamp: ts(30),
			agentId: "visa:BuyBot-abc123",
			agentName: "BuyBot Shopping Agent",
			agentNetwork: "visa",
			verified: true,
			action: "llms_txt_concise",
			path: "/llms.txt",
			productSlug: null,
			searchQuery: "toddler ski goggles",
			statusCode: 200,
		},
	];

	await recordEventBatch(store, env, seed);
	// Marker TTL is deliberately decoupled from event retention. If we tied
	// this to EVENT_RETENTION_DAYS, a quiet merchant store would let the
	// marker expire and re-seed demo data on top of real events.
	await store.put(SEED_MARKER_KEY, new Date().toISOString(), {
		expirationTtl: SEED_MARKER_TTL_SECONDS,
	});
}

// ---------------------------------------------------------------------------
// Request → event classification
// ---------------------------------------------------------------------------

export function classifyAction(
	path: string,
	intent?: string | null,
): AgentAction {
	if (path === "/llms.txt") return "llms_txt_concise";
	if (path === "/llms-full.txt") return "llms_txt_full";
	if (path.startsWith("/api/products/") && path.split("/").length > 3)
		return "product_detail";
	if (path === "/api/products") return "catalog_browse";
	if (path.startsWith("/api/checkout") || intent === "pay")
		return "checkout_attempt";
	if (path === "/") return "homepage";
	return "unknown";
}

export function extractProductSlug(path: string): string | null {
	const match = path.match(/^\/api\/products\/([^/?]+)/);
	return match ? match[1] : null;
}

function getProductName(slug: string): string {
	return PRODUCT_NAMES[slug] ?? slug;
}

function getProductPrice(slug: string): number {
	return PRODUCT_PRICES[slug] ?? 0;
}

function agentKey(e: AgentEvent): string {
	return e.agentId ?? e.agentName ?? "anonymous";
}

function agentDisplayName(e: AgentEvent): string {
	return e.agentName ?? e.agentId ?? "anonymous";
}

// ---------------------------------------------------------------------------
// Summary computation
// ---------------------------------------------------------------------------

export function computeSummary(
	events: AgentEvent[],
	merchantName: string,
): AgentAnalyticsSummary {
	const now = new Date();
	const nowIso = now.toISOString();

	if (events.length === 0) {
		return emptySummary(nowIso, merchantName);
	}

	// Group events by agent. Each group is sorted chronologically (oldest
	// first) so downstream code can trust `agentEvents[0]` to be the agent's
	// first event and `agentEvents[last]` to be its most recent.
	const agentMap = new Map<string, AgentEvent[]>();
	for (const e of events) {
		const key = agentKey(e);
		if (!agentMap.has(key)) agentMap.set(key, []);
		agentMap.get(key)!.push(e);
	}
	for (const bucket of agentMap.values()) {
		bucket.sort(
			(a, b) =>
				new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
		);
	}

	const agentBreakdown: AgentProfile[] = [];
	for (const [id, agentEvents] of agentMap) {
		const firstEvent = agentEvents[0];
		const lastEvent = agentEvents[agentEvents.length - 1];
		const successfulCheckouts = agentEvents.filter(
			(e) => e.action === "checkout_attempt" && e.statusCode === 200,
		);
		const revenue = successfulCheckouts.reduce(
			(sum, e) => sum + getProductPrice(e.productSlug ?? ""),
			0,
		);

		agentBreakdown.push({
			agentId: id,
			agentName: firstEvent.agentName,
			network: firstEvent.agentNetwork,
			verified: firstEvent.verified,
			totalRequests: agentEvents.length,
			productsViewed: agentEvents.filter((e) => e.action === "product_detail")
				.length,
			checkoutAttempts: agentEvents.filter(
				(e) => e.action === "checkout_attempt",
			).length,
			successfulCheckouts: successfulCheckouts.length,
			estimatedRevenue: revenue,
			lastSeen: lastEvent.timestamp,
		});
	}
	agentBreakdown.sort((a, b) => b.totalRequests - a.totalRequests);

	const productMap = new Map<
		string,
		{
			views: Set<string>;
			detailViews: number;
			checkouts: number;
			successfulCheckouts: number;
			viewers: Set<string>;
			purchasers: Set<string>;
		}
	>();
	for (const e of events) {
		if (!e.productSlug) continue;
		if (!productMap.has(e.productSlug)) {
			productMap.set(e.productSlug, {
				views: new Set(),
				detailViews: 0,
				checkouts: 0,
				successfulCheckouts: 0,
				viewers: new Set(),
				purchasers: new Set(),
			});
		}
		const p = productMap.get(e.productSlug)!;
		const key = agentKey(e);
		p.views.add(key);
		if (e.action === "product_detail") {
			p.detailViews++;
			p.viewers.add(agentDisplayName(e));
		}
		if (e.action === "checkout_attempt") {
			p.checkouts++;
			if (e.statusCode === 200) {
				p.successfulCheckouts++;
				p.purchasers.add(agentDisplayName(e));
			}
		}
	}

	const topProducts: ProductAnalytics[] = [];
	for (const [slug, data] of productMap) {
		const viewedNotPurchased = [...data.viewers].filter(
			(n) => !data.purchasers.has(n),
		);
		// Conversion = unique-agents-who-bought / unique-agents-who-interacted.
		// Using the raw checkout count as the numerator would let a single agent
		// pushing multiple orders drive the rate above 100%.
		const conversionRate =
			data.views.size > 0 ? data.purchasers.size / data.views.size : 0;
		topProducts.push({
			slug,
			name: getProductName(slug),
			price: getProductPrice(slug),
			detailViews: data.detailViews,
			uniqueAgentViews: data.views.size,
			checkoutAttempts: data.checkouts,
			successfulCheckouts: data.successfulCheckouts,
			conversionRate,
			estimatedRevenue: data.successfulCheckouts * getProductPrice(slug),
			viewedNotPurchased,
		});
	}
	topProducts.sort((a, b) => b.detailViews - a.detailViews);

	const discoveryReads = events.filter(
		(e) => e.action === "llms_txt_concise",
	).length;
	const fullDetailReads = events.filter(
		(e) => e.action === "llms_txt_full",
	).length;
	const productDetailReads = events.filter(
		(e) => e.action === "product_detail",
	).length;
	const checkoutAttempts = events.filter(
		(e) => e.action === "checkout_attempt",
	).length;
	const successfulCheckouts = events.filter(
		(e) => e.action === "checkout_attempt" && e.statusCode === 200,
	).length;
	const blockedCheckouts = events.filter(
		(e) => e.action === "checkout_attempt" && e.statusCode === 403,
	).length;

	const funnel: FunnelMetrics = {
		discoveryReads,
		fullDetailReads,
		productDetailReads,
		checkoutAttempts,
		successfulCheckouts,
		blockedCheckouts,
		discoveryToFullRate:
			discoveryReads > 0 ? fullDetailReads / discoveryReads : 0,
		discoveryToProductRate:
			discoveryReads > 0 ? productDetailReads / discoveryReads : 0,
		productToCheckoutRate:
			productDetailReads > 0 ? checkoutAttempts / productDetailReads : 0,
		checkoutSuccessRate:
			checkoutAttempts > 0 ? successfulCheckouts / checkoutAttempts : 0,
	};

	const agentsReadingConcise = new Set(
		events
			.filter((e) => e.action === "llms_txt_concise")
			.map((e) => agentKey(e)),
	);
	const agentsReadingFull = new Set(
		events.filter((e) => e.action === "llms_txt_full").map((e) => agentKey(e)),
	);
	const agentsDirectProduct = new Set(
		events
			.filter((e) => e.action === "product_detail")
			.map((e) => agentKey(e))
			.filter(
				(id) => !agentsReadingConcise.has(id) && !agentsReadingFull.has(id),
			),
	);

	const totalUniqueAgents = agentMap.size;
	const contentQuality: ContentQualityMetrics = {
		conciseOnlyRate:
			totalUniqueAgents > 0
				? Math.max(0, agentsReadingConcise.size - agentsReadingFull.size) /
					totalUniqueAgents
				: 0,
		neededFullRate:
			totalUniqueAgents > 0 ? agentsReadingFull.size / totalUniqueAgents : 0,
		directProductRate:
			totalUniqueAgents > 0 ? agentsDirectProduct.size / totalUniqueAgents : 0,
	};

	const queryMap = new Map<string, number>();
	for (const e of events) {
		if (e.searchQuery) {
			queryMap.set(e.searchQuery, (queryMap.get(e.searchQuery) ?? 0) + 1);
		}
	}
	const topSearchQueries = [...queryMap.entries()]
		.map(([query, count]) => ({ query, count }))
		.sort((a, b) => b.count - a.count)
		.slice(0, 10);

	const allCheckouts = events.filter((e) => e.action === "checkout_attempt");
	const allSuccessful = allCheckouts.filter((e) => e.statusCode === 200);
	const verifiedSuccessful = allSuccessful.filter((e) => e.verified);
	const unverifiedSuccessful = allSuccessful.filter((e) => !e.verified);

	const totalRevenue = allSuccessful.reduce(
		(sum, e) => sum + getProductPrice(e.productSlug ?? ""),
		0,
	);
	const verifiedRevenue = verifiedSuccessful.reduce(
		(sum, e) => sum + getProductPrice(e.productSlug ?? ""),
		0,
	);
	const unverifiedRevenue = unverifiedSuccessful.reduce(
		(sum, e) => sum + getProductPrice(e.productSlug ?? ""),
		0,
	);

	const orderingAgents = new Set(allSuccessful.map((e) => agentKey(e)));
	const avgOrderValue =
		orderingAgents.size > 0 ? totalRevenue / orderingAgents.size : 0;

	const networkMap = new Map<
		string,
		{
			agents: Set<string>;
			attempts: number;
			successful: number;
			revenue: number;
		}
	>();
	for (const e of allCheckouts) {
		const net = e.agentNetwork ?? "unverified";
		if (!networkMap.has(net))
			networkMap.set(net, {
				agents: new Set(),
				attempts: 0,
				successful: 0,
				revenue: 0,
			});
		const n = networkMap.get(net)!;
		n.agents.add(agentKey(e));
		n.attempts++;
		if (e.statusCode === 200) {
			n.successful++;
			n.revenue += getProductPrice(e.productSlug ?? "");
		}
	}

	const byNetwork: Record<string, NetworkMetrics> = {};
	for (const [net, data] of networkMap) {
		byNetwork[net] = {
			agents: data.agents.size,
			checkoutAttempts: data.attempts,
			successfulCheckouts: data.successful,
			estimatedRevenue: data.revenue,
			conversionRate: data.attempts > 0 ? data.successful / data.attempts : 0,
		};
	}

	const revenue: RevenueMetrics = {
		estimatedTotal: totalRevenue,
		verifiedRevenue,
		unverifiedRevenue,
		verifiedCheckoutAttempts: allCheckouts.filter((e) => e.verified).length,
		unverifiedCheckoutAttempts: allCheckouts.filter((e) => !e.verified).length,
		averageOrderValue: avgOrderValue,
		byNetwork,
	};

	const agentJourneys = computeJourneys(agentMap, now);
	const security = computeSecurity(agentMap, events);
	const demandSignals = computeDemandSignals(agentMap);
	const insights = generateInsights(
		agentBreakdown,
		topProducts,
		security,
		demandSignals,
		contentQuality,
		agentJourneys,
		revenue,
	);

	return {
		period: nowIso,
		merchantName,
		totalEvents: events.length,
		uniqueAgents: totalUniqueAgents,
		agentBreakdown,
		topProducts,
		funnel,
		contentQuality,
		topSearchQueries,
		revenue,
		agentJourneys,
		security,
		demandSignals,
		insights,
	};
}

function computeJourneys(
	agentMap: Map<string, AgentEvent[]>,
	now: Date,
): AgentJourney[] {
	const journeys: AgentJourney[] = [];

	for (const [, agentEvents] of agentMap) {
		const sorted = [...agentEvents].sort(
			(a, b) =>
				new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
		);
		const first = sorted[0];

		const steps: JourneyStep[] = sorted.map((e) => {
			const minutesAgo = Math.round(
				(now.getTime() - new Date(e.timestamp).getTime()) / 60000,
			);
			return {
				timestamp: e.timestamp,
				minutesAgo,
				action: e.action,
				description: describeAction(e),
				productSlug: e.productSlug,
				productName: e.productSlug ? getProductName(e.productSlug) : null,
				searchQuery: e.searchQuery,
				statusCode: e.statusCode,
			};
		});

		let isReturnVisitor = false;
		for (let i = 1; i < sorted.length; i++) {
			const gap =
				new Date(sorted[i].timestamp).getTime() -
				new Date(sorted[i - 1].timestamp).getTime();
			if (gap > 30 * 60 * 1000) {
				isReturnVisitor = true;
				break;
			}
		}

		const successfulCheckouts = sorted.filter(
			(e) => e.action === "checkout_attempt" && e.statusCode === 200,
		);
		const itemsPurchased = successfulCheckouts.length;
		const estimatedSpend = successfulCheckouts.reduce(
			(sum, e) => sum + getProductPrice(e.productSlug ?? ""),
			0,
		);

		const firstTs = new Date(sorted[0].timestamp).getTime();
		const lastTs = new Date(sorted[sorted.length - 1].timestamp).getTime();
		const sessionDurationMinutes = Math.round((lastTs - firstTs) / 60000);

		journeys.push({
			agentId: agentKey(first),
			agentName: first.agentName,
			network: first.agentNetwork,
			verified: first.verified,
			steps,
			journeySummary: buildJourneySummary(sorted),
			sessionDurationMinutes,
			isReturnVisitor,
			itemsPurchased,
			estimatedSpend,
		});
	}

	journeys.sort((a, b) => b.steps.length - a.steps.length);
	return journeys;
}

function describeAction(e: AgentEvent): string {
	switch (e.action) {
		case "llms_txt_concise":
			return e.searchQuery
				? `Searched "${e.searchQuery}" via /llms.txt`
				: "Read /llms.txt";
		case "llms_txt_full":
			return "Read /llms-full.txt";
		case "product_detail":
			return `Viewed ${getProductName(e.productSlug ?? "")}`;
		case "checkout_attempt":
			if (e.statusCode === 403)
				return `Checkout BLOCKED for ${getProductName(e.productSlug ?? "")}`;
			return `Checkout: ${getProductName(e.productSlug ?? "")}`;
		case "catalog_browse":
			return "Browsed product catalog";
		case "homepage":
			return "Visited homepage";
		default:
			return e.path;
	}
}

function buildJourneySummary(sorted: AgentEvent[]): string {
	const phases: string[] = [];
	const hasDiscovery = sorted.some(
		(e) => e.action === "llms_txt_concise" || e.action === "llms_txt_full",
	);
	const productViews = sorted.filter(
		(e) => e.action === "product_detail",
	).length;
	const successfulCheckouts = sorted.filter(
		(e) => e.action === "checkout_attempt" && e.statusCode === 200,
	).length;
	const blockedCheckouts = sorted.filter(
		(e) => e.action === "checkout_attempt" && e.statusCode === 403,
	).length;

	if (hasDiscovery) phases.push("Discovery");
	if (productViews > 0) phases.push(`Browse(${productViews})`);
	if (successfulCheckouts > 0) phases.push(`Purchase(${successfulCheckouts})`);
	if (blockedCheckouts > 0) phases.push(`Blocked(${blockedCheckouts})`);

	for (let i = 1; i < sorted.length; i++) {
		const gap =
			new Date(sorted[i].timestamp).getTime() -
			new Date(sorted[i - 1].timestamp).getTime();
		if (gap > 30 * 60 * 1000) {
			phases.push("Return");
			break;
		}
	}

	if (phases.length === 1 && hasDiscovery) phases.push("Bounce");
	return phases.join(" → ");
}

function computeSecurity(
	agentMap: Map<string, AgentEvent[]>,
	allEvents: AgentEvent[],
): SecurityMetrics {
	let verifiedAgents = 0;
	let unverifiedAgents = 0;
	for (const [, agentEvents] of agentMap) {
		if (agentEvents[0].verified) verifiedAgents++;
		else unverifiedAgents++;
	}

	const checkoutEvents = allEvents.filter(
		(e) => e.action === "checkout_attempt",
	);
	const blockedCheckouts = checkoutEvents.filter(
		(e) => e.statusCode === 403,
	).length;
	const totalCheckoutAttempts = checkoutEvents.length;

	const unverifiedHighValue: SecurityEvent[] = allEvents
		.filter(
			(e) =>
				!e.verified &&
				(e.action === "checkout_attempt" || e.action === "product_detail"),
		)
		.map((e) => ({
			agentName: e.agentName ?? "unknown",
			action:
				e.action === "checkout_attempt"
					? "Checkout attempt"
					: "Product detail view",
			path: e.path,
			statusCode: e.statusCode,
			timestamp: e.timestamp,
		}));

	return {
		verifiedAgents,
		unverifiedAgents,
		verifiedRate:
			verifiedAgents + unverifiedAgents > 0
				? verifiedAgents / (verifiedAgents + unverifiedAgents)
				: 0,
		blockedCheckouts,
		totalCheckoutAttempts,
		checkoutBlockRate:
			totalCheckoutAttempts > 0 ? blockedCheckouts / totalCheckoutAttempts : 0,
		unverifiedHighValueAttempts: unverifiedHighValue,
	};
}

function computeDemandSignals(
	agentMap: Map<string, AgentEvent[]>,
): DemandSignals {
	const convertedQueries: QueryOutcome[] = [];
	const browseOnlyQueries: QueryOutcome[] = [];
	const bouncedQueries: QueryOutcome[] = [];
	const unmatchedDemand: QueryOutcome[] = [];

	for (const [, agentEvents] of agentMap) {
		const queries = agentEvents.filter((e) => e.searchQuery);
		if (queries.length === 0) continue;

		const name = agentDisplayName(agentEvents[0]);
		const hasCheckout = agentEvents.some(
			(e) => e.action === "checkout_attempt" && e.statusCode === 200,
		);
		const hasBlockedCheckout = agentEvents.some(
			(e) => e.action === "checkout_attempt" && e.statusCode === 403,
		);
		const hasProductView = agentEvents.some(
			(e) => e.action === "product_detail",
		);
		const productsViewed = agentEvents
			.filter((e) => e.action === "product_detail" && e.productSlug)
			.map((e) => getProductName(e.productSlug!));
		const itemsPurchased = agentEvents.filter(
			(e) => e.action === "checkout_attempt" && e.statusCode === 200,
		).length;

		for (const qEvent of queries) {
			const query = qEvent.searchQuery!;
			const isLikelyUnmatched =
				!hasProductView && !hasCheckout && !hasBlockedCheckout;

			if (hasCheckout) {
				convertedQueries.push({
					query,
					agentName: name,
					outcome: "purchased",
					itemsPurchased,
					productsViewed,
				});
			} else if (hasBlockedCheckout) {
				browseOnlyQueries.push({
					query,
					agentName: name,
					outcome: "blocked",
					productsViewed,
				});
			} else if (isLikelyUnmatched) {
				unmatchedDemand.push({ query, agentName: name, outcome: "unmatched" });
			} else if (hasProductView) {
				browseOnlyQueries.push({
					query,
					agentName: name,
					outcome: "browsed",
					productsViewed,
				});
			} else {
				bouncedQueries.push({ query, agentName: name, outcome: "bounced" });
			}
		}
	}

	return {
		convertedQueries,
		browseOnlyQueries,
		bouncedQueries,
		unmatchedDemand,
	};
}

function generateInsights(
	agents: AgentProfile[],
	products: ProductAnalytics[],
	security: SecurityMetrics,
	demand: DemandSignals,
	content: ContentQualityMetrics,
	journeys: AgentJourney[],
	revenue: RevenueMetrics,
): Insight[] {
	const insights: Insight[] = [];

	const topAgent = [...agents].sort(
		(a, b) => b.estimatedRevenue - a.estimatedRevenue,
	)[0];
	if (topAgent && topAgent.estimatedRevenue > 0) {
		insights.push({
			icon: "star",
			label: "Top agent",
			text: `${topAgent.agentName ?? topAgent.agentId} — ${topAgent.successfulCheckouts} checkouts, est. $${topAgent.estimatedRevenue.toFixed(2)} revenue`,
			priority: 1,
		});
	}

	const returnVisitors = journeys.filter((j) => j.isReturnVisitor);
	for (const rv of returnVisitors) {
		const returnQuery = rv.steps.filter((s) => s.searchQuery).pop();
		insights.push({
			icon: "refresh",
			label: "Repeat visitor",
			text: `${rv.agentName ?? rv.agentId} returned${returnQuery ? ` searching "${returnQuery.searchQuery}"` : ""} (${rv.sessionDurationMinutes} min session)`,
			priority: 2,
		});
	}

	if (security.blockedCheckouts > 0) {
		const blockedAgents = security.unverifiedHighValueAttempts
			.filter((e) => e.statusCode === 403)
			.map((e) => e.agentName);
		const uniqueBlocked = [...new Set(blockedAgents)];
		insights.push({
			icon: "block",
			label: "Blocked",
			text: `${uniqueBlocked.join(", ")} checkout denied (unverified)`,
			priority: 3,
		});
	}

	if (demand.unmatchedDemand.length > 0) {
		const queries = demand.unmatchedDemand
			.map((d) => `"${d.query}"`)
			.join(", ");
		insights.push({
			icon: "gap",
			label: "Product gap",
			text: `${demand.unmatchedDemand.length} search${demand.unmatchedDemand.length > 1 ? "es" : ""} with no matching product: ${queries}`,
			priority: 4,
		});
	}

	if (content.conciseOnlyRate > 0.5) {
		insights.push({
			icon: "ok",
			label: "Content working",
			text: `${(content.conciseOnlyRate * 100).toFixed(0)}% of agents needed only concise /llms.txt`,
			priority: 6,
		});
	}
	if (content.neededFullRate > 0) {
		const fullAgents = journeys.filter((j) =>
			j.steps.some((s) => s.action === "llms_txt_full"),
		);
		const names = fullAgents.map((j) => j.agentName ?? j.agentId).join(", ");
		insights.push({
			icon: "dots",
			label: "Content gap",
			text: `${names} needed /llms-full.txt — concise descriptions insufficient for their use case`,
			priority: 7,
		});
	}

	const topProduct = [...products].sort(
		(a, b) => b.successfulCheckouts - a.successfulCheckouts,
	)[0];
	if (topProduct && topProduct.successfulCheckouts > 0) {
		insights.push({
			icon: "trophy",
			label: "Top product",
			text: `${topProduct.name} — ${topProduct.uniqueAgentViews} agents viewed, ${(topProduct.conversionRate * 100).toFixed(0)}% conversion, $${topProduct.estimatedRevenue.toFixed(2)} revenue`,
			priority: 5,
		});
	}

	if (revenue.estimatedTotal > 0) {
		insights.push({
			icon: "dollar",
			label: "Revenue",
			text: `Est. $${revenue.estimatedTotal.toFixed(2)} from agent commerce (${revenue.verifiedCheckoutAttempts} verified, ${revenue.unverifiedCheckoutAttempts} unverified attempts)`,
			priority: 0,
		});
	}

	return insights.sort((a, b) => a.priority - b.priority);
}

function emptySummary(
	period: string,
	merchantName: string,
): AgentAnalyticsSummary {
	return {
		period,
		merchantName,
		totalEvents: 0,
		uniqueAgents: 0,
		agentBreakdown: [],
		topProducts: [],
		funnel: {
			discoveryReads: 0,
			fullDetailReads: 0,
			productDetailReads: 0,
			checkoutAttempts: 0,
			successfulCheckouts: 0,
			blockedCheckouts: 0,
			discoveryToFullRate: 0,
			discoveryToProductRate: 0,
			productToCheckoutRate: 0,
			checkoutSuccessRate: 0,
		},
		contentQuality: {
			conciseOnlyRate: 0,
			neededFullRate: 0,
			directProductRate: 0,
		},
		topSearchQueries: [],
		revenue: {
			estimatedTotal: 0,
			verifiedRevenue: 0,
			unverifiedRevenue: 0,
			verifiedCheckoutAttempts: 0,
			unverifiedCheckoutAttempts: 0,
			averageOrderValue: 0,
			byNetwork: {},
		},
		agentJourneys: [],
		security: {
			verifiedAgents: 0,
			unverifiedAgents: 0,
			verifiedRate: 0,
			blockedCheckouts: 0,
			totalCheckoutAttempts: 0,
			checkoutBlockRate: 0,
			unverifiedHighValueAttempts: [],
		},
		demandSignals: {
			convertedQueries: [],
			browseOnlyQueries: [],
			bouncedQueries: [],
			unmatchedDemand: [],
		},
		insights: [],
	};
}
