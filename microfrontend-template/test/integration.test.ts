import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

describe("Microfrontend Router", () => {
	describe("routing", () => {
		it("routes /app1 requests to worker-a", async () => {
			const response = await SELF.fetch("https://example.com/app1");
			expect(response.status).toBe(200);

			const html = await response.text();
			expect(html).toContain("<h1>Worker A</h1>");
			expect(html).toContain("Path: /");
		});

		it("routes /app1/subpath requests to worker-a with stripped prefix", async () => {
			const response = await SELF.fetch("https://example.com/app1/subpath");
			expect(response.status).toBe(200);

			const html = await response.text();
			expect(html).toContain("<h1>Worker A</h1>");
			expect(html).toContain("Path: /subpath");
		});

		it("routes /app2 requests to worker-b", async () => {
			const response = await SELF.fetch("https://example.com/app2");
			expect(response.status).toBe(200);

			const html = await response.text();
			expect(html).toContain("<h1>Worker B</h1>");
		});

		it("routes /app2/nested/path requests correctly", async () => {
			const response = await SELF.fetch("https://example.com/app2/nested/path");
			expect(response.status).toBe(200);

			const html = await response.text();
			expect(html).toContain("<h1>Worker B</h1>");
			expect(html).toContain("Path: /nested/path");
		});
	});

	describe("URL rewriting", () => {
		it("rewrites asset URLs in HTML from /app1", async () => {
			const response = await SELF.fetch("https://example.com/app1");
			const html = await response.text();

			// Asset paths should be rewritten to include mount prefix
			expect(html).toContain('href="/app1/assets/style.css"');
			expect(html).toContain('src="/app1/assets/logo.png"');
			expect(html).toContain('src="/app1/static/app.js"');
		});

		it("rewrites favicon URLs", async () => {
			const response = await SELF.fetch("https://example.com/app1");
			const html = await response.text();

			// Favicon should be rewritten even though it doesn't match asset prefixes
			expect(html).toContain('href="/app1/favicon.ico"');
		});

		it("rewrites asset URLs in HTML from /app2", async () => {
			const response = await SELF.fetch("https://example.com/app2");
			const html = await response.text();

			// Asset paths should be rewritten to include mount prefix
			expect(html).toContain('href="/app2/build/style.css"');
			expect(html).toContain('src="/app2/assets/image.png"');
		});
	});

	describe("redirect handling", () => {
		it("rewrites redirect Location headers", async () => {
			const response = await SELF.fetch(
				"https://example.com/app2/redirect-test",
				{ redirect: "manual" },
			);

			expect(response.status).toBe(302);
			const location = response.headers.get("Location");
			// Location should be rewritten to include mount prefix
			expect(location).toContain("/app2/redirected");
		});
	});

	describe("cookie handling", () => {
		it("rewrites Set-Cookie Path to include mount prefix", async () => {
			const response = await SELF.fetch("https://example.com/app2/set-cookie");

			const setCookie = response.headers.get("Set-Cookie");
			expect(setCookie).toBeTruthy();
			// Path=/ should be rewritten to Path=/app2/
			expect(setCookie).toContain("Path=/app2/");
		});
	});

	describe("preload script", () => {
		it("serves preload script at /__mf-preload.js when other routes have preload enabled", async () => {
			// The preload script is only served when there are OTHER routes with preload: true
			// Since /app1 has preload: true, visiting /app2 should serve /app1 in the preload script
			const response = await SELF.fetch(
				"https://example.com/app2/__mf-preload.js",
			);

			expect(response.status).toBe(200);
			expect(response.headers.get("Content-Type")).toContain(
				"application/javascript",
			);

			const script = await response.text();
			expect(script).toContain("fetch");
			expect(script).toContain("/app1"); // Should contain the route to preload
		});
	});
});
