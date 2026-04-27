import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

describe("Outcome Shopping Orchestrator", () => {
	it("returns 200 and JSON on /api (service info)", async () => {
		const response = await SELF.fetch("https://example.com/api");
		expect(response.status).toBe(200);
		const json = (await response.json()) as Record<string, unknown>;
		expect(json).toHaveProperty("service");
		expect(json).toHaveProperty("endpoints");
	});

	it("returns llms.txt as markdown with correct headers", async () => {
		const response = await SELF.fetch("https://example.com/llms.txt");
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toContain("text/markdown");
		expect(response.headers.get("content-signal")).toContain("ai-input=yes");
		expect(response.headers.get("cache-control")).toContain("public");
	});

	it("llms.txt describes the orchestrator and its endpoints", async () => {
		const response = await SELF.fetch("https://example.com/llms.txt");
		const text = await response.text();
		expect(text).toContain("# Outcome Shopping Orchestrator");
		expect(text).toContain("/api/shop");
		expect(text).toContain("/api/catalogs");
	});

	it("returns registered merchants on /api/merchants", async () => {
		const response = await SELF.fetch("https://example.com/api/merchants");
		expect(response.status).toBe(200);
		const json = (await response.json()) as {
			merchants: unknown[];
			count: number;
			note?: string;
		};
		expect(json).toHaveProperty("merchants");
		expect(json).toHaveProperty("count");
		// With no endpoints configured, the note explains sample-data fallback
		expect(typeof json.note === "string" || json.count > 0).toBe(true);
	});

	it("returns aggregated catalogs with sample data when no merchants are configured", async () => {
		const response = await SELF.fetch("https://example.com/api/catalogs");
		expect(response.status).toBe(200);
		const json = (await response.json()) as {
			totalMerchants: number;
			totalProducts: number;
			usingSampleData: boolean;
			products: Array<{ slug: string; name: string; merchantName: string }>;
		};
		expect(json.usingSampleData).toBe(true);
		expect(json.totalProducts).toBeGreaterThan(0);
		expect(json.products[0]).toHaveProperty("merchantName");
	});

	it("rejects /api/shop when the query parameter is missing", async () => {
		const response = await SELF.fetch("https://example.com/api/shop");
		expect(response.status).toBe(400);
		const json = (await response.json()) as { error: string };
		expect(json.error.toLowerCase()).toContain("missing");
	});

	it("rejects /api/shop when the query exceeds the max length", async () => {
		const longQuery = "a".repeat(501);
		const response = await SELF.fetch(
			`https://example.com/api/shop?q=${longQuery}`,
		);
		expect(response.status).toBe(400);
		const json = (await response.json()) as { error: string };
		expect(json.error.toLowerCase()).toContain("too long");
	});

	it("lists the documented endpoints on /api", async () => {
		const response = await SELF.fetch("https://example.com/api");
		const json = (await response.json()) as {
			endpoints: Record<string, string>;
		};
		expect(json.endpoints).toHaveProperty("GET /api/shop?q=<intent>");
		expect(json.endpoints).toHaveProperty("GET /llms.txt");
		expect(json.endpoints).toHaveProperty("GET /api/catalogs");
	});
});
