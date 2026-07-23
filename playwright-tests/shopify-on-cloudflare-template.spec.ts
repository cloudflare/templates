import { test, expect } from "./fixtures";

const REPO_URL = "https://github.com/devkindhq/shopify-on-cloudflare";
const DEVKIND_URL = "https://devkind.com.au";

/**
 * Smoke tests for the critical paths of this Shopify embedded-app starter.
 *
 * The authenticated Polaris UI only renders inside the Shopify Admin iframe
 * (it needs a host param + API key via App Bridge), so a bare browser cannot
 * exercise it. These tests cover the parts that hold without a Shopify session:
 * the public preview page, the health endpoint, and the security middleware
 * that rejects unauthenticated `/api/*` requests.
 */
test.describe("Shopify on Cloudflare Template", () => {
	test("health endpoint responds OK", async ({ request, templateUrl }) => {
		const res = await request.get(`${templateUrl}/health`);
		expect(res.status()).toBe(200);
		expect(await res.json()).toMatchObject({ status: "ok" });
	});

	test("protected API route rejects unauthenticated requests", async ({
		request,
		templateUrl,
	}) => {
		const res = await request.get(`${templateUrl}/api/example`);
		expect(res.status()).toBe(401);
	});

	test("public preview page opens without Shopify auth", async ({
		request,
		templateUrl,
	}) => {
		const res = await request.get(`${templateUrl}/preview`);
		expect(res.status()).toBe(200);
		const html = await res.text();
		expect(html).toContain("Shopify embedded app");
	});

	test("preview shows key content and a correct Devkind backlink", async ({
		page,
		templateUrl,
	}) => {
		await page.goto(`${templateUrl}/preview`);

		await expect(
			page.getByRole("heading", { name: /Shopify on Cloudflare/i }),
		).toBeVisible();
		// Embedded-app framing must be unmistakable so a reviewer does not flag
		// it as a broken storefront.
		await expect(page.getByText(/not a running store/i)).toBeVisible();

		// Source backlink to the Devkind repository resolves to the right URL.
		const github = page.getByRole("link", { name: /View on GitHub/i });
		await expect(github).toHaveAttribute("href", REPO_URL);
		// Attribution backlink to Devkind.
		await expect(page.getByRole("link", { name: "Devkind" })).toHaveAttribute(
			"href",
			DEVKIND_URL,
		);
	});

	test("public preview makes no authenticated Shopify request", async ({
		page,
		templateUrl,
	}) => {
		// The preview page carries no App Bridge session. Capture every request
		// it issues and assert none are authenticated Shopify calls (no Bearer
		// token, no App Bridge bootstrap). The unauthenticated /health and
		// /api/example probes for the status panel are expected and allowed.
		const authenticated: string[] = [];
		page.on("request", (req) => {
			if (req.headers()["authorization"]) authenticated.push(req.url());
			if (req.url().includes("app-bridge")) authenticated.push(req.url());
		});

		await page.goto(`${templateUrl}/preview`);
		await page.waitForLoadState("networkidle");

		expect(authenticated).toEqual([]);
	});
});
