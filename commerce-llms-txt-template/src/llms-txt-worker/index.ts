/**
 * Commerce llms.txt Worker
 *
 * Dynamically generates /llms.txt for a merchant's product catalog,
 * following the llms.txt spec (https://llmstxt.org) but extended for
 * commerce with real-time inventory and agent-friendly descriptions.
 *
 * This builds on Cloudflare's existing Markdown for Agents feature
 * (which converts HTML to markdown on-the-fly) by going one step
 * further: generating a structured, agent-optimized product catalog
 * that an AI shopping agent can consume in a single request.
 *
 * Endpoints:
 *   GET /llms.txt           — The dynamic llms.txt file (agent-friendly)
 *   GET /llms-full.txt      — Expanded version with full enriched descriptions
 *   GET /api/products       — Full enriched catalog as JSON
 *   GET /api/products/:slug — Single product detail
 *   GET /                   — Service info and endpoint listing
 *
 * Runs on port 8787 (default wrangler dev port).
 */

import { Hono } from "hono";
import { getCatalogWithLiveInventory } from "../lib/catalog";
import { fetchShopifyCatalog } from "../lib/shopify";
import { enrichCatalog, fallbackEnrichment } from "../enrichment";
import type { RawProduct, EnrichedProduct } from "../lib/types";

interface Env {
	AI?: Ai;
	ENRICHMENT_CACHE: KVNamespace;
	SHOPIFY_STORE_DOMAIN?: string;
	SHOPIFY_STORE_PASSWORD?: string;
	MERCHANT_NAME?: string;
	MERCHANT_DESCRIPTION?: string;
	STORE_CURRENCY?: string;
	SHIPPING_POLICY?: string;
	RETURN_POLICY?: string;
	MERCHANT_VERTICAL?: string;
	ENRICHMENT_CACHE_TTL?: string;
	AI_MODEL?: string;
}

const app = new Hono<{ Bindings: Env }>();

// Global error handler
app.onError((err, c) => {
	console.error(`[Error] ${c.req.method} ${c.req.path}: ${err.message}`);
	return c.json({ error: "Internal server error" }, 500);
});

/** Resolve merchant config from env vars with sensible defaults. */
function getMerchantConfig(env: Env) {
	return {
		name: env.MERCHANT_NAME || "My Store",
		description:
			env.MERCHANT_DESCRIPTION ||
			"Product catalog powered by Commerce llms.txt",
		currency: env.STORE_CURRENCY || "USD",
		shippingPolicy: env.SHIPPING_POLICY || "",
		returnPolicy: env.RETURN_POLICY || "",
		vertical: env.MERCHANT_VERTICAL || "general retail",
		cacheTtl: parseInt(env.ENRICHMENT_CACHE_TTL || "3600", 10),
	};
}

// ---------------------------------------------------------------------------
// Enrichment with KV-backed caching
// ---------------------------------------------------------------------------

const KV_CACHE_KEY = "enriched-catalog";

async function getEnrichedCatalog(
	env: Env,
	ctx?: ExecutionContext,
): Promise<EnrichedProduct[]> {
	const config = getMerchantConfig(env);
	const cacheTtlSeconds = config.cacheTtl;

	// Try KV cache first
	const cached = (await env.ENRICHMENT_CACHE.get(KV_CACHE_KEY, "json")) as
		| EnrichedProduct[]
		| null;
	if (cached) {
		console.log(`[Cache] Serving ${cached.length} products from KV cache`);
		return cached;
	}

	// Fetch from Shopify if configured, otherwise fall back to sample catalog
	let catalog: RawProduct[];
	if (env.SHOPIFY_STORE_DOMAIN) {
		try {
			catalog = await fetchShopifyCatalog(
				env.SHOPIFY_STORE_DOMAIN,
				env.SHOPIFY_STORE_PASSWORD,
			);
			console.log(
				`[Catalog] Fetched ${catalog.length} products from Shopify (${env.SHOPIFY_STORE_DOMAIN})`,
			);
		} catch (err) {
			console.log(
				`[Catalog] Shopify fetch failed, using sample catalog: ${err}`,
			);
			catalog = getCatalogWithLiveInventory();
		}
	} else {
		console.log(`[Catalog] No Shopify store configured, using sample catalog`);
		catalog = getCatalogWithLiveInventory();
	}

	// Enrich with Workers AI, or fall back to rule-based enrichment
	let enriched: EnrichedProduct[];
	if (env.AI) {
		try {
			enriched = await enrichCatalog(
				catalog,
				env.AI,
				config.vertical,
				env.AI_MODEL,
			);
			console.log(
				`[Enrichment] AI enrichment complete for ${enriched.length} products`,
			);
		} catch (err) {
			console.log(`[Enrichment] AI call failed, using fallback: ${err}`);
			enriched = catalog.map(fallbackEnrichment);
		}
	} else {
		console.log(
			`[Enrichment] No AI binding available (local dev), using fallback enrichment`,
		);
		enriched = catalog.map(fallbackEnrichment);
	}

	// Write to KV. Uses waitUntil so the response isn't blocked by the KV write.
	const kvWrite = env.ENRICHMENT_CACHE.put(
		KV_CACHE_KEY,
		JSON.stringify(enriched),
		{
			expirationTtl: cacheTtlSeconds,
		},
	).then(() => {
		console.log(
			`[Cache] Wrote ${enriched.length} products to KV cache (TTL: ${cacheTtlSeconds}s)`,
		);
	});
	if (ctx) {
		ctx.waitUntil(kvWrite);
	} else {
		await kvWrite;
	}

	return enriched;
}

// ---------------------------------------------------------------------------
// llms.txt generation (follows https://llmstxt.org spec)
// ---------------------------------------------------------------------------

interface MerchantConfig {
	name: string;
	description: string;
	currency: string;
	shippingPolicy: string;
	returnPolicy: string;
	vertical: string;
	cacheTtl: number;
}

function generateLlmsTxt(
	products: EnrichedProduct[],
	full: boolean,
	config: MerchantConfig,
): string {
	const inStockProducts = products.filter((p) => p.inStock);
	const outOfStockProducts = products.filter((p) => !p.inStock);
	const categories = [...new Set(products.map((p) => p.category))];
	const now = new Date().toISOString();

	let txt = `# ${config.name}

> ${config.description}. This catalog is dynamically generated with real-time inventory and AI-enriched product descriptions optimized for agent consumption.

- **Generated**: ${now}
- **Total products**: ${products.length} (${inStockProducts.length} in stock, ${outOfStockProducts.length} out of stock)
- **Categories**: ${categories.join(", ")}
- **Pricing**: All prices in ${config.currency}, tax not included
`;

	if (config.shippingPolicy) {
		txt += `- **Shipping**: ${config.shippingPolicy}\n`;
	}
	if (config.returnPolicy) {
		txt += `- **Returns**: ${config.returnPolicy}\n`;
	}

	txt += `
## Products In Stock

`;

	for (const product of inStockProducts) {
		txt += `### ${product.name}\n`;
		txt += `- **Price**: $${product.price}\n`;
		txt += `- **Category**: ${product.category}\n`;
		txt += `- **Availability**: In stock${product.stockCount > 0 ? ` (${product.stockCount} available)` : ""}\n`;
		txt += `- **Summary**: ${product.agentSummary}\n`;
		txt += `- **Best for**: ${product.bestFor}\n`;
		txt += `- **Use cases**: ${product.useCaseTags.join(", ")}\n`;

		if (full) {
			txt += `- **Highlights**:\n`;
			for (const h of product.highlights) {
				txt += `  - ${h}\n`;
			}
			txt += `- **Specs**:\n`;
			for (const [key, val] of Object.entries(product.specs)) {
				txt += `  - ${key.replace(/_/g, " ")}: ${val}\n`;
			}
		}

		txt += `- [Product details](/api/products/${product.slug})\n\n`;
	}

	if (outOfStockProducts.length > 0) {
		txt += `## Currently Out of Stock\n\n`;
		for (const product of outOfStockProducts) {
			txt += `### ${product.name}\n`;
			txt += `- **Price**: $${product.price}\n`;
			txt += `- **Category**: ${product.category}\n`;
			txt += `- **Availability**: Out of stock\n`;
			txt += `- **Summary**: ${product.agentSummary}\n`;
			txt += `- [Product details](/api/products/${product.slug})\n\n`;
		}
	}

	txt += `## Optional

- [Raw product catalog JSON](/api/products): Complete product data in JSON format with all specifications
- [API documentation](/api): Available API endpoints for programmatic access
`;

	return txt;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get("/llms.txt", async (c) => {
	const products = await getEnrichedCatalog(c.env, c.executionCtx);
	const config = getMerchantConfig(c.env);
	const txt = generateLlmsTxt(products, false, config);

	return new Response(txt, {
		headers: {
			"Content-Type": "text/markdown; charset=utf-8",
			// Rough token estimate (chars / 4) so consuming agents can gauge size before parsing.
			"x-markdown-tokens": String(Math.ceil(txt.length / 4)),
			// Content-Signal is a proposed header for signaling content preferences to AI agents.
			// ai-input=yes: this content is intended for AI consumption.
			// search=yes: this content may be indexed by search engines.
			// ai-train=no: this content should not be used for model training.
			// See: https://contentcredentials.org/
			"Content-Signal": "ai-input=yes, search=yes, ai-train=no",
			"Cache-Control": "public, max-age=300",
		},
	});
});

app.get("/llms-full.txt", async (c) => {
	const products = await getEnrichedCatalog(c.env, c.executionCtx);
	const config = getMerchantConfig(c.env);
	const txt = generateLlmsTxt(products, true, config);

	return new Response(txt, {
		headers: {
			"Content-Type": "text/markdown; charset=utf-8",
			"x-markdown-tokens": String(Math.ceil(txt.length / 4)),
			"Content-Signal": "ai-input=yes, search=yes, ai-train=no", // see /llms.txt handler for docs
			"Cache-Control": "public, max-age=300",
		},
	});
});

app.get("/api/products", async (c) => {
	const products = await getEnrichedCatalog(c.env, c.executionCtx);
	const config = getMerchantConfig(c.env);
	return c.json({
		merchant: config.name,
		productCount: products.length,
		generatedAt: new Date().toISOString(),
		products,
	});
});

app.get("/api/products/:slug", async (c) => {
	const slug = c.req.param("slug");
	const products = await getEnrichedCatalog(c.env, c.executionCtx);
	const product = products.find((p) => p.slug === slug);

	if (!product) {
		return c.json({ error: "Product not found", slug }, 404);
	}

	return c.json({ product });
});

app.get("/api", (c) => {
	const config = getMerchantConfig(c.env);
	return c.json({
		service: `${config.name} — Commerce API`,
		merchant: config.name,
		description: config.description,
		dataSource: c.env.SHOPIFY_STORE_DOMAIN
			? `shopify (${c.env.SHOPIFY_STORE_DOMAIN})`
			: "sample catalog",
		endpoints: {
			"GET /llms.txt":
				"Agent-optimized product catalog (llms.txt format, concise)",
			"GET /llms-full.txt":
				"Agent-optimized product catalog (llms.txt format, full details with specs)",
			"GET /api/products": "Complete product catalog as JSON",
			"GET /api/products/:slug": "Single product detail as JSON",
			"GET /api/raw-catalog":
				"Raw merchant catalog (pre-enrichment) — the input to Workers AI",
		},
		note: "AI agents: request /llms.txt for an optimized product catalog with real-time inventory and natural language descriptions.",
	});
});

// Raw (pre-enrichment) catalog — used by the built-in UI to visualize
// what Workers AI adds on top of the merchant's source data.
app.get("/api/raw-catalog", async (c) => {
	let catalog: RawProduct[];
	if (c.env.SHOPIFY_STORE_DOMAIN) {
		try {
			catalog = await fetchShopifyCatalog(
				c.env.SHOPIFY_STORE_DOMAIN,
				c.env.SHOPIFY_STORE_PASSWORD,
			);
		} catch {
			catalog = getCatalogWithLiveInventory();
		}
	} else {
		catalog = getCatalogWithLiveInventory();
	}
	const config = getMerchantConfig(c.env);
	return c.json({
		merchant: config.name,
		source: c.env.SHOPIFY_STORE_DOMAIN
			? `shopify (${c.env.SHOPIFY_STORE_DOMAIN})`
			: "sample catalog",
		productCount: catalog.length,
		products: catalog,
	});
});

export default app;
