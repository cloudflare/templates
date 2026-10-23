import { test, expect } from "./fixtures";

/**
 * Smoke tests for the critical user paths of an embedded Shopify app.
 *
 * Note: the React UI boots Shopify App Bridge inside the Shopify admin iframe
 * (it needs a host param + API key), so a bare browser can't render the
 * authenticated Polaris UI. These tests therefore verify the parts that hold
 * without a live Shopify session: the health endpoint, that protected `/api/*`
 * routes reject unauthenticated requests (the security middleware), and that
 * the SPA HTML shell is served.
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
		expect(await res.json()).toMatchObject({ error: "Unauthorized" });
	});

	test("serves the SPA shell", async ({ page, templateUrl }) => {
		await page.goto(templateUrl);
		await expect(page).toHaveTitle(/Shopify/i);
		// The mount point and App Bridge bootstrap are present in the served HTML
		// regardless of whether React can fully hydrate outside the Shopify iframe.
		await expect(page.locator("#root")).toBeAttached();
		await expect(page.locator('script[src*="app-bridge.js"]')).toBeAttached();
	});

	test("public /preview page renders without Shopify auth", async ({
		request,
		page,
		templateUrl,
	}) => {
		const res = await request.get(`${templateUrl}/preview`);
		expect(res.status()).toBe(200);
		expect(await res.text()).toContain("Shopify embedded app");

		// Renders in a bare browser (no Shopify iframe / session).
		await page.goto(`${templateUrl}/preview`);
		await expect(
			page.getByRole("heading", { name: /Shopify on Cloudflare/i }),
		).toBeVisible();
		// The embedded-app framing is prominent so a reviewer can't mistake it for a broken app.
		await expect(page.getByText(/not a running store/i)).toBeVisible();
		await expect(
			page.getByRole("link", { name: /View on GitHub/i }),
		).toBeVisible();
	});
});
