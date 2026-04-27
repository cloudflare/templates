/**
 * A merchant endpoint registered in the orchestrator.
 */
export interface MerchantEndpoint {
	name: string;
	url: string;
}

/**
 * A product from a merchant's /api/products endpoint.
 * Mirrors the EnrichedProduct shape from commerce-llms-txt-template.
 */
export interface MerchantProduct {
	slug: string;
	name: string;
	price: number;
	currency: string;
	category: string;
	inStock: boolean;
	stockCount: number;
	specs: Record<string, string>;
	description: string;
	imageUrl?: string;
	lastUpdated: string;
	// Enriched fields
	agentSummary: string;
	useCaseTags: string[];
	highlights: string[];
	bestFor: string;
}

/**
 * A product with its merchant source attached.
 */
export interface SourcedProduct extends MerchantProduct {
	merchantName: string;
	merchantUrl: string;
}

/**
 * The result of fetching a merchant's catalog.
 */
export interface MerchantCatalog {
	merchantName: string;
	merchantUrl: string;
	products: MerchantProduct[];
	fetchedAt: string;
	error?: string;
}

/**
 * A component need decomposed from a user's outcome intent.
 */
export interface ComponentNeed {
	need: string;
	priority: "essential" | "recommended" | "optional";
	searchTerms: string[];
}

/**
 * A product recommendation for a single component need.
 */
export interface Recommendation {
	need: string;
	priority: "essential" | "recommended" | "optional";
	product: SourcedProduct;
	reasoning: string;
	alternatives?: SourcedProduct[];
}

/**
 * The full outcome shopping result.
 */
export interface OutcomeResult {
	intent: string;
	decomposition: ComponentNeed[];
	/** Set when AI decomposition failed and the orchestrator fell back to a single-need match. */
	decompositionFallback?: "ai_error" | "ai_empty";
	recommendations: Recommendation[];
	unfulfilledNeeds: ComponentNeed[];
	totalEstimatedCost: number;
	currency: string;
	merchantsUsed: string[];
	generatedAt: string;
	/** True when using sample/demo data because live merchant fetches failed or none are configured. */
	usingSampleData: boolean;
}

/**
 * Env bindings for the Worker.
 *
 * KV is a required binding — CATALOG_CACHE stores the aggregated
 * multi-merchant catalog so we don't re-fetch every merchant on each
 * shopping request. The `kv_namespaces` declaration in wrangler.jsonc
 * provisions this automatically via "Deploy to Cloudflare"; manual
 * deploys create the namespace with `wrangler kv namespace create` and
 * paste the id into wrangler.jsonc.
 */
export interface Env {
	AI: Ai;
	CATALOG_CACHE: KVNamespace;
	MERCHANT_ENDPOINTS: string;
	AI_MODEL?: string;
	CACHE_TTL?: string;
}
