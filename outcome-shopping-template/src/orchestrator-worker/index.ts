/**
 * Outcome Shopping Orchestrator Worker
 *
 * Takes a natural language shopping intent, decomposes it into component
 * product needs using Workers AI, and composes a cross-merchant
 * recommendation from each registered merchant's /api/products endpoint.
 *
 * Merchants are expected to serve the /api/products shape emitted by the
 * commerce-llms-txt-template. When no merchants are configured (or all
 * configured endpoints fail), the bundled sample catalog is used so the
 * template is useful the moment it's deployed.
 *
 * Caching:
 *   The aggregated multi-merchant catalog is cached in KV (CATALOG_CACHE)
 *   with a configurable TTL. Per-request AI calls are not cached.
 *
 * Endpoints:
 *   GET /api                 — API documentation
 *   GET /api/shop?q=<intent> — Run the orchestrator for a shopping intent
 *   GET /api/catalogs        — Aggregated multi-merchant catalog
 *   GET /api/merchants       — Registered merchants with connectivity status
 *   GET /llms.txt            — Agent-readable capability description
 *
 *   GET /                    — React SPA (served as Workers Static Assets)
 */

import { Hono } from "hono";
import type { Env, MerchantEndpoint, OutcomeResult } from "../lib/types";
import { fetchAllCatalogs, flattenCatalogs } from "../lib/catalog";
import { decomposeIntent } from "../lib/decompose";
import { matchProductsToNeeds } from "../lib/match";

const DEFAULT_AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const DEFAULT_CACHE_TTL_SECONDS = 300;
// KV's minimum expirationTtl is 60 seconds. Anything below silently rejects.
const MIN_CACHE_TTL_SECONDS = 60;
const MAX_INTENT_LENGTH = 500;

const app = new Hono<{ Bindings: Env }>();

function getMerchants(env: Env): MerchantEndpoint[] {
	try {
		const parsed = JSON.parse(
			env.MERCHANT_ENDPOINTS || "[]",
		) as MerchantEndpoint[];
		return Array.isArray(parsed) ? parsed : [];
	} catch (err) {
		console.error("[config] Failed to parse MERCHANT_ENDPOINTS:", err);
		return [];
	}
}

function resolveConfig(env: Env) {
	const rawTtl = parseInt(env.CACHE_TTL || "", 10);
	const cacheTtl =
		Number.isFinite(rawTtl) && rawTtl >= MIN_CACHE_TTL_SECONDS
			? rawTtl
			: DEFAULT_CACHE_TTL_SECONDS;

	return {
		merchants: getMerchants(env),
		model: env.AI_MODEL || DEFAULT_AI_MODEL,
		cacheTtl,
	};
}

// ---------------------------------------------------------------------------
// /api — service documentation
// ---------------------------------------------------------------------------

app.get("/api", (c) => {
	const { merchants } = resolveConfig(c.env);
	return c.json({
		service: "Outcome Shopping Orchestrator",
		description:
			"Multi-vendor, outcome-based shopping. Describe what you want to achieve and the orchestrator decomposes the intent into component needs, then composes a cross-merchant recommendation from each merchant's /api/products endpoint.",
		registeredMerchants: merchants.map((m) => ({ name: m.name, url: m.url })),
		endpoints: {
			"GET /api": "Service documentation (this response)",
			"GET /api/shop?q=<intent>": "Run the orchestrator for a shopping intent",
			"GET /api/catalogs": "Aggregated multi-merchant catalog",
			"GET /api/merchants": "Registered merchants with connectivity status",
			"GET /llms.txt": "Agent-readable capability description",
			"GET /": "React SPA demo UI",
		},
	});
});

// ---------------------------------------------------------------------------
// /llms.txt — agent-readable capability description
// ---------------------------------------------------------------------------

app.get("/llms.txt", (c) => {
	const { merchants } = resolveConfig(c.env);
	const merchantList =
		merchants.length > 0
			? merchants.map((m) => `  - ${m.name}: ${m.url}`).join("\n")
			: "  - (none configured — the orchestrator serves a bundled sample catalog)";

	const txt = `# Outcome Shopping Orchestrator

> Outcome-based shopping across multiple merchants. Describe what you want to achieve ("outfit my 3-year-old for skiing", "set up a home office") and this service decomposes the intent into component needs, searches across each registered merchant's AI-enriched catalog, and returns a cross-merchant recommendation.

- Powered by: Cloudflare Workers + Workers AI
- Merchant catalogs: each merchant runs a commerce-llms-txt-template Worker that serves /api/products
- Registered merchants:
${merchantList}

## How to use

Send a GET request to \`/api/shop?q=<your intent>\` with a natural language description of what you want.

Example:
  GET /api/shop?q=outfit my 3-year-old for skiing

The JSON response includes:
- Decomposition of the intent into component needs (skis, boots, helmet, ...)
- A recommended product per need, sourced from the best-matching merchant
- Alternatives where available
- Total estimated cost and the set of merchants used
- Unfulfilled needs (products no merchant carries)

## API endpoints

- \`/api/shop?q=<intent>\` — Outcome-based shopping (JSON)
- \`/api/catalogs\` — The full aggregated multi-merchant catalog
- \`/api/merchants\` — Registered merchants and connectivity status
`;

	return c.text(txt, 200, {
		"Content-Type": "text/markdown; charset=utf-8",
		"Content-Signal": "ai-input=yes, search=yes, ai-train=no",
		"Cache-Control": "public, max-age=300",
	});
});

// ---------------------------------------------------------------------------
// /api/merchants — connectivity status
// ---------------------------------------------------------------------------

app.get("/api/merchants", async (c) => {
	const { merchants } = resolveConfig(c.env);

	const statuses = await Promise.all(
		merchants.map(async (m) => {
			try {
				const res = await fetch(`${m.url.replace(/\/$/, "")}/api`, {
					headers: { Accept: "application/json" },
					signal: AbortSignal.timeout(3000),
				});
				if (res.ok) {
					const data = (await res.json()) as {
						merchant?: string;
						service?: string;
					};
					return {
						name: m.name,
						url: m.url,
						status: "online" as const,
						merchantName: data.merchant,
						service: data.service,
					};
				}
				return {
					name: m.name,
					url: m.url,
					status: "error" as const,
					error: `HTTP ${res.status}`,
				};
			} catch (err) {
				return {
					name: m.name,
					url: m.url,
					status: "offline" as const,
					error: err instanceof Error ? err.message : "Unknown error",
				};
			}
		}),
	);

	const note =
		merchants.length === 0
			? "No merchants configured — the orchestrator is serving a bundled sample catalog. Set MERCHANT_ENDPOINTS in wrangler.jsonc to connect real merchants."
			: null;

	return c.json({
		merchants: statuses,
		count: statuses.length,
		note,
	});
});

// ---------------------------------------------------------------------------
// /api/catalogs — aggregated multi-merchant catalog
// ---------------------------------------------------------------------------

app.get("/api/catalogs", async (c) => {
	const { merchants, cacheTtl } = resolveConfig(c.env);
	const { catalogs, usingSampleData, fromCache } = await fetchAllCatalogs(
		merchants,
		c.env.CATALOG_CACHE,
		cacheTtl,
		c.executionCtx,
	);
	const allProducts = flattenCatalogs(catalogs);

	return c.json({
		totalMerchants: catalogs.length,
		totalProducts: allProducts.length,
		usingSampleData,
		fromCache,
		catalogs: catalogs.map((cat) => ({
			merchant: cat.merchantName,
			url: cat.merchantUrl,
			productCount: cat.products.length,
			inStockCount: cat.products.filter((p) => p.inStock).length,
			fetchedAt: cat.fetchedAt,
			error: cat.error,
		})),
		products: allProducts,
	});
});

// ---------------------------------------------------------------------------
// /api/shop — the orchestrator
// ---------------------------------------------------------------------------

app.get("/api/shop", async (c) => {
	const intent = c.req.query("q")?.trim();
	if (!intent) {
		return c.json(
			{
				error:
					"Missing query parameter 'q'. Provide a shopping intent, e.g., ?q=outfit my 3-year-old for skiing",
			},
			400,
		);
	}
	if (intent.length > MAX_INTENT_LENGTH) {
		return c.json(
			{ error: `Query too long (max ${MAX_INTENT_LENGTH} characters)` },
			400,
		);
	}

	const { merchants, model, cacheTtl } = resolveConfig(c.env);

	// Step 1: Fetch all merchant catalogs. `fetchAllCatalogs` always returns
	// products — it falls back to the bundled sample catalog when no merchants
	// are configured or every configured merchant fails — so we don't need a
	// "no products available" error branch here.
	const { catalogs, usingSampleData } = await fetchAllCatalogs(
		merchants,
		c.env.CATALOG_CACHE,
		cacheTtl,
		c.executionCtx,
	);
	const allProducts = flattenCatalogs(catalogs);

	// Step 2: Decompose intent into component needs
	const decomposition = await decomposeIntent(intent, c.env.AI, model);

	// Step 3: Match products to needs across all merchants
	const { recommendations, unfulfilledNeeds } = await matchProductsToNeeds(
		decomposition.needs,
		allProducts,
		intent,
		c.env.AI,
		model,
	);

	// Step 4: Assemble result
	const totalCost = recommendations.reduce(
		(sum, r) => sum + r.product.price,
		0,
	);
	const merchantsUsed = [
		...new Set(recommendations.map((r) => r.product.merchantName)),
	];

	const result: OutcomeResult = {
		intent,
		decomposition: decomposition.needs,
		decompositionFallback: decomposition.fallback,
		recommendations,
		unfulfilledNeeds,
		totalEstimatedCost: Math.round(totalCost * 100) / 100,
		currency: recommendations[0]?.product.currency || "USD",
		merchantsUsed,
		generatedAt: new Date().toISOString(),
		usingSampleData,
	};

	return c.json(result);
});

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------

app.onError((err, c) => {
	console.error("[orchestrator] Unhandled error:", err);
	return c.json({ error: "Internal server error" }, 500);
});

export default app;
