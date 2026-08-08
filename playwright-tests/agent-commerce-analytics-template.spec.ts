import { test, expect } from "./fixtures";

test.describe("Agent Commerce Analytics Template", () => {
	test("should render the SPA on root", async ({ page, templateUrl }) => {
		const response = await page.goto(templateUrl);
		expect(response?.status()).toBe(200);
		// SPA renders client-side — wait for the brand title in the topbar
		await expect(
			page.getByText("Agent Commerce Analytics", { exact: true }).first(),
		).toBeVisible();
	});

	test("should return JSON service info on /api", async ({
		page,
		templateUrl,
	}) => {
		const response = await page.goto(`${templateUrl}/api`);
		expect(response?.status()).toBe(200);
		const text = await page.textContent("body");
		expect(text).toContain("Agent Commerce Analytics");
		expect(text).toContain("endpoints");
	});

	test("should return a populated dashboard summary on /api/dashboard", async ({
		page,
		templateUrl,
	}) => {
		const response = await page.goto(`${templateUrl}/api/dashboard`);
		expect(response?.status()).toBe(200);
		const text = await page.textContent("body");
		expect(text).toContain("totalEvents");
		expect(text).toContain("agentBreakdown");
	});

	test("should return the funnel on /api/dashboard/funnel", async ({
		page,
		templateUrl,
	}) => {
		const response = await page.goto(`${templateUrl}/api/dashboard/funnel`);
		expect(response?.status()).toBe(200);
		const text = await page.textContent("body");
		expect(text).toContain("discoveryReads");
	});
});
