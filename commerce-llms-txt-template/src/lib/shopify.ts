/**
 * Shopify product data source for Commerce llms.txt
 *
 * Fetches real product data from a Shopify store's /products.json endpoint
 * and maps it to our RawProduct type for enrichment by Workers AI.
 *
 * This replaces the mock catalog (catalog.ts) with live Shopify data.
 */

import type { RawProduct } from "./types";

interface ShopifyVariant {
  id: number;
  title: string;
  price: string;
  available: boolean;
  sku: string;
  grams: number;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  compare_at_price: string | null;
}

interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  body_html: string;
  vendor: string;
  product_type: string;
  tags: string[];
  variants: ShopifyVariant[];
  options: Array<{ name: string; position: number; values: string[] }>;
  published_at: string;
  updated_at: string;
}

interface ShopifyProductsResponse {
  products: ShopifyProduct[];
}

/**
 * Strip HTML tags from Shopify body_html to get plain text description.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract specs from a Shopify product description.
 *
 * Shopify doesn't have a native "specs" field, so we parse the description
 * for spec-like patterns (key: value, key/value pairs separated by periods).
 * This is intentionally imperfect — real merchant data is messy, and that's
 * the point of the demo.
 */
function extractSpecs(description: string, product: ShopifyProduct): Record<string, string> {
  const specs: Record<string, string> = {};

  // Add variant options as specs
  for (const option of product.options) {
    if (option.name !== "Title") {
      specs[option.name.toLowerCase()] = option.values.join(", ");
    }
  }

  // Add product type
  if (product.product_type) {
    specs["type"] = product.product_type;
  }

  // Parse description for spec-like patterns
  // Look for patterns like "Key: Value" or "Key Value" separated by periods
  const sentences = description.split(/\.\s*/);
  for (const sentence of sentences) {
    const colonMatch = sentence.match(/^([^:]{2,30}):\s*(.+)/);
    if (colonMatch) {
      const key = colonMatch[1].trim().toLowerCase().replace(/\s+/g, "_");
      const value = colonMatch[2].trim();
      if (key && value && value.length < 200) {
        specs[key] = value;
      }
    }
  }

  // Add weight from first variant if available
  const firstVariant = product.variants[0];
  if (firstVariant && firstVariant.grams > 0) {
    specs["weight"] = `${firstVariant.grams}g`;
  }

  // Add tags as a spec
  if (product.tags.length > 0) {
    specs["tags"] = product.tags.join(", ");
  }

  return specs;
}

/**
 * Map a Shopify product to our RawProduct type.
 *
 * We aggregate variants to determine:
 * - Price: lowest variant price (the "starting at" price)
 * - In stock: true if any variant is available
 * - Stock count: sum of available variants (Shopify /products.json doesn't
 *   expose exact inventory counts, so we estimate from variant availability)
 */
function mapShopifyProduct(product: ShopifyProduct): RawProduct {
  const description = stripHtml(product.body_html || "");
  const prices = product.variants.map((v) => parseFloat(v.price));
  const lowestPrice = Math.min(...prices);
  const anyAvailable = product.variants.some((v) => v.available);
  const availableCount = product.variants.filter((v) => v.available).length;

  // Derive a category from product_type or tags
  const category = product.product_type?.toLowerCase() || product.tags[0] || "uncategorized";

  return {
    slug: product.handle,
    name: product.title,
    price: lowestPrice,
    currency: "USD", // Overridden by STORE_CURRENCY env var in llms.txt output
    category,
    inStock: anyAvailable,
    stockCount: anyAvailable ? availableCount * 5 : 0, // Estimate: ~5 units per available variant
    specs: extractSpecs(description, product),
    description,
    imageUrl: undefined,
    lastUpdated: product.updated_at || new Date().toISOString(),
  };
}

/**
 * Fetch the product catalog from a Shopify store.
 *
 * Uses the public /products.json endpoint. For password-protected stores,
 * we first authenticate via the /password page to get a session cookie.
 */
export async function fetchShopifyCatalog(
  storeDomain: string,
  storePassword?: string
): Promise<RawProduct[]> {
  const baseUrl = `https://${storeDomain}`;
  const headers: Record<string, string> = {};

  // If store is password-protected, authenticate first
  if (storePassword) {
    const passwordResponse = await fetch(`${baseUrl}/password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `password=${encodeURIComponent(storePassword)}`,
      redirect: "manual",
    });

    // Extract the storefront cookie from the response.
    // Workers' Headers supports getAll(); standard Headers does not,
    // so we fall back to get() for compatibility.
    const respHeaders = passwordResponse.headers as Headers & { getAll?: (name: string) => string[] };
    const setCookies: string[] = respHeaders.getAll
      ? respHeaders.getAll("set-cookie")
      : [respHeaders.get("set-cookie") || ""];

    const cookies = setCookies
      .filter(Boolean)
      .map((c: string) => c.split(";")[0])
      .join("; ");

    if (cookies) {
      headers["Cookie"] = cookies;
    }
  }

  const response = await fetch(`${baseUrl}/products.json?limit=250`, { headers });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Shopify catalog: ${response.status} ${response.statusText}`
    );
  }

  const data = (await response.json()) as ShopifyProductsResponse;
  return data.products.map(mapShopifyProduct);
}
