import { test, expect } from "./fixtures";

// The actual screenshot path requires a real headless browser (Browser
// Rendering has no local simulation), so these tests cover the deterministic,
// binding-free paths: the home-page form and URL validation. The screenshot
// happy path is exercised in live/deployed E2E.
test.describe("Browser Rendering Screenshots Template", () => {
	test("Should render the screenshot form on the home page", async ({
		page,
		templateUrl,
	}) => {
		await page.goto(templateUrl);

		await expect(
			page.getByRole("heading", { name: "Browser Rendering Screenshots" }),
		).toBeVisible();
		await expect(page.getByPlaceholder("https://example.com")).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Screenshot" }),
		).toBeVisible();
	});

	test("Should serve the home page as HTML", async ({ page, templateUrl }) => {
		const response = await page.goto(templateUrl);

		expect(response?.status()).toBe(200);
		expect(response?.headers()["content-type"]).toContain("text/html");
	});

	test("Should document the direct-call endpoint", async ({
		page,
		templateUrl,
	}) => {
		await page.goto(templateUrl);

		await expect(
			page.getByText("/?url=https://example.com", { exact: false }),
		).toBeVisible();
	});

	test("Should reject an invalid url parameter", async ({
		page,
		templateUrl,
	}) => {
		const response = await page.goto(`${templateUrl}/?url=not-a-valid-url`);

		expect(response?.status()).toBe(400);
		await expect(page.locator("body")).toContainText("Invalid");
	});

	test("Should reject non-http(s) url schemes", async ({
		page,
		templateUrl,
	}) => {
		// `new URL("javascript:...")` parses successfully, so the Worker must
		// reject it explicitly. Guards against an SSRF/scheme-injection regression.
		const response = await page.goto(
			`${templateUrl}/?url=${encodeURIComponent("javascript:alert(1)")}`,
		);

		expect(response?.status()).toBe(400);
		await expect(page.locator("body")).toContainText(
			"Only http and https URLs are supported",
		);
	});
});
