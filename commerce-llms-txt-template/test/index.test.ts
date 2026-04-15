import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

describe("Commerce llms.txt", () => {
	it("returns 200 and JSON on root endpoint", async () => {
		const response = await SELF.fetch("https://example.com/");
		expect(response.status).toBe(200);
		const json = (await response.json()) as Record<string, unknown>;
		expect(json).toHaveProperty("merchant");
		expect(json).toHaveProperty("endpoints");
	});

	it("returns llms.txt as markdown with correct headers", async () => {
		const response = await SELF.fetch("https://example.com/llms.txt");
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/markdown");
		expect(response.headers.get("content-signal")).toContain("ai-input=yes");
		expect(response.headers.get("cache-control")).toContain("public");
	});

	it("generates valid llms.txt content with products", async () => {
		const response = await SELF.fetch("https://example.com/llms.txt");
		const text = await response.text();
		expect(text).toContain("# ");
		expect(text).toContain("## Products In Stock");
		expect(text).toContain("**Price**");
		expect(text).toContain("**Summary**");
	});

	it("returns llms-full.txt with specs and highlights", async () => {
		const response = await SELF.fetch("https://example.com/llms-full.txt");
		expect(response.status).toBe(200);
		const text = await response.text();
		expect(text).toContain("**Highlights**");
		expect(text).toContain("**Specs**");
	});

	it("returns JSON product catalog on /api/products", async () => {
		const response = await SELF.fetch("https://example.com/api/products");
		expect(response.status).toBe(200);
		const json = (await response.json()) as {
			merchant: string;
			productCount: number;
			products: unknown[];
		};
		expect(json.productCount).toBeGreaterThan(0);
		expect(json.products).toBeInstanceOf(Array);
		expect(json.products.length).toBe(json.productCount);
	});

	it("returns single product by slug", async () => {
		// First get the catalog to find a valid slug
		const catalogResponse = await SELF.fetch(
			"https://example.com/api/products",
		);
		const catalog = (await catalogResponse.json()) as {
			products: Array<{ slug: string }>;
		};
		const slug = catalog.products[0].slug;

		const response = await SELF.fetch(
			`https://example.com/api/products/${slug}`,
		);
		expect(response.status).toBe(200);
		const json = (await response.json()) as {
			product: { slug: string; agentSummary: string };
		};
		expect(json.product.slug).toBe(slug);
		expect(json.product.agentSummary).toBeTruthy();
	});

	it("returns 404 for unknown product slug", async () => {
		const response = await SELF.fetch(
			"https://example.com/api/products/nonexistent-product-xyz",
		);
		expect(response.status).toBe(404);
		const json = (await response.json()) as { error: string };
		expect(json.error).toBe("Product not found");
	});

	it("returns API documentation on /api", async () => {
		const response = await SELF.fetch("https://example.com/api");
		expect(response.status).toBe(200);
		const json = (await response.json()) as {
			service: string;
			endpoints: Record<string, string>;
		};
		expect(json.endpoints).toHaveProperty("GET /llms.txt");
		expect(json.endpoints).toHaveProperty("GET /api/products");
	});

	it("includes merchant config from env vars in llms.txt output", async () => {
		const response = await SELF.fetch("https://example.com/llms.txt");
		const text = await response.text();
		// Default merchant name from wrangler.json vars
		expect(text).toContain("My Store");
		expect(text).toContain("USD");
	});
});
