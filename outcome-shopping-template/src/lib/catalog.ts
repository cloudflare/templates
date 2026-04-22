import type {
	MerchantEndpoint,
	MerchantCatalog,
	MerchantProduct,
	SourcedProduct,
} from "./types";
import { getSampleCatalogs } from "./sample-catalogs";

const AGGREGATED_CATALOGS_PREFIX = "aggregated-catalogs:";
const CATALOG_FETCH_TIMEOUT_MS = 5000;

/**
 * Cache key that incorporates the configured merchant set so a change to
 * `MERCHANT_ENDPOINTS` automatically invalidates the cache instead of
 * returning stale catalog data until TTL expiry.
 */
function cacheKey(merchants: MerchantEndpoint[]): string {
	const fingerprint = merchants
		.map((m) => `${m.name}|${m.url.replace(/\/$/, "")}`)
		.sort()
		.join(";");
	return `${AGGREGATED_CATALOGS_PREFIX}${fingerprint}`;
}

/**
 * Fetch a single merchant's product catalog via their /api/products endpoint.
 */
async function fetchMerchantCatalog(
	merchant: MerchantEndpoint,
): Promise<MerchantCatalog> {
	const url = `${merchant.url.replace(/\/$/, "")}/api/products`;

	try {
		const response = await fetch(url, {
			headers: {
				Accept: "application/json",
				"User-Agent": "Cloudflare-Outcome-Shopping/1.0",
			},
			signal: AbortSignal.timeout(CATALOG_FETCH_TIMEOUT_MS),
		});

		if (!response.ok) {
			return {
				merchantName: merchant.name,
				merchantUrl: merchant.url,
				products: [],
				fetchedAt: new Date().toISOString(),
				error: `HTTP ${response.status}: ${response.statusText}`,
			};
		}

		const data = (await response.json()) as {
			merchant: string;
			productCount: number;
			products: MerchantProduct[];
		};

		return {
			merchantName: merchant.name,
			merchantUrl: merchant.url,
			products: data.products || [],
			fetchedAt: new Date().toISOString(),
		};
	} catch (err) {
		return {
			merchantName: merchant.name,
			merchantUrl: merchant.url,
			products: [],
			fetchedAt: new Date().toISOString(),
			error: err instanceof Error ? err.message : "Unknown fetch error",
		};
	}
}

export interface CatalogFetchResult {
	catalogs: MerchantCatalog[];
	/** True when sample data is being served (no endpoints configured or all fetches failed). */
	usingSampleData: boolean;
	/** True when catalogs came from the KV cache. */
	fromCache: boolean;
}

/**
 * Fetch catalogs from all registered merchants in parallel.
 *
 * KV is the canonical cache. If `MERCHANT_ENDPOINTS` is empty or every
 * configured merchant fetch fails, the bundled sample catalogs are served
 * so the template is useful the moment it's deployed. The cache key
 * incorporates the merchant set, so changing `MERCHANT_ENDPOINTS` busts
 * the cache automatically.
 */
export async function fetchAllCatalogs(
	merchants: MerchantEndpoint[],
	cache: KVNamespace,
	cacheTtl: number,
	ctx?: ExecutionContext,
): Promise<CatalogFetchResult> {
	// No endpoints configured — serve the sample catalog and skip the cache.
	if (merchants.length === 0) {
		return {
			catalogs: getSampleCatalogs(),
			usingSampleData: true,
			fromCache: false,
		};
	}

	const key = cacheKey(merchants);

	// Try KV cache first
	const cached = (await cache.get(key, "json")) as MerchantCatalog[] | null;
	if (cached) {
		return { catalogs: cached, usingSampleData: false, fromCache: true };
	}

	// Fetch all merchants in parallel
	const catalogs = await Promise.all(
		merchants.map((m) => fetchMerchantCatalog(m)),
	);

	// If every merchant failed (e.g., behind Access, DNS errors), fall back to sample
	// data rather than returning an empty result. Do not cache the fallback.
	const allFailed = catalogs.every((c) => c.products.length === 0);
	if (allFailed) {
		return {
			catalogs: getSampleCatalogs(),
			usingSampleData: true,
			fromCache: false,
		};
	}

	// Cache the aggregated result. Uses waitUntil so the response isn't blocked.
	const kvWrite = cache
		.put(key, JSON.stringify(catalogs), {
			expirationTtl: cacheTtl,
		})
		.catch((err) => {
			console.error("[catalog] KV write failed:", err);
		});
	if (ctx) {
		ctx.waitUntil(kvWrite);
	} else {
		await kvWrite;
	}

	return { catalogs, usingSampleData: false, fromCache: false };
}

/**
 * Flatten all merchant catalogs into a single array of sourced, in-stock products.
 */
export function flattenCatalogs(catalogs: MerchantCatalog[]): SourcedProduct[] {
	const products: SourcedProduct[] = [];

	for (const catalog of catalogs) {
		for (const product of catalog.products) {
			if (product.inStock) {
				products.push({
					...product,
					merchantName: catalog.merchantName,
					merchantUrl: catalog.merchantUrl,
				});
			}
		}
	}

	return products;
}
