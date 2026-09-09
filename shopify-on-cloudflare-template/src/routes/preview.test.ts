import { describe, it, expect } from "vitest";
import { previewRoutes } from "./preview";

describe("GET /preview (public template preview)", () => {
	it("serves an HTML page with no auth required", async () => {
		const res = await previewRoutes.request("/preview");
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/html");
	});

	it("emphasises the embedded-app nature and includes the repo + attribution links", async () => {
		const res = await previewRoutes.request("/preview");
		const html = await res.text();
		expect(html).toContain("Shopify on Cloudflare");
		expect(html).toContain("Shopify embedded app");
		expect(html).toContain("Shopify Admin");
		expect(html).toContain("not a running store");
		expect(html).toContain("github.com/devkindhq/shopify-on-cloudflare");
		expect(html).toContain("devkind.com.au");
	});
});
