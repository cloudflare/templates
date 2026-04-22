import { test, expect } from "./fixtures";

test.describe("Outcome Shopping Template", () => {
	test("should render the SPA on root", async ({ page, templateUrl }) => {
		const response = await page.goto(templateUrl);
		expect(response?.status()).toBe(200);
		// SPA renders client-side — wait for the H1 from App.tsx
		await expect(
			page.getByRole("heading", { name: "Outcome Shopping" }),
		).toBeVisible();
	});

	test("should return JSON service info on /api", async ({
		page,
		templateUrl,
	}) => {
		const response = await page.goto(`${templateUrl}/api`);
		expect(response?.status()).toBe(200);
		const text = await page.textContent("body");
		expect(text).toContain("Outcome Shopping Orchestrator");
		expect(text).toContain("endpoints");
	});

	test("should serve llms.txt endpoint", async ({ page, templateUrl }) => {
		const response = await page.goto(`${templateUrl}/llms.txt`);
		expect(response?.status()).toBe(200);
		const text = await page.textContent("body");
		expect(text).toContain("Outcome Shopping Orchestrator");
	});

	test("should return aggregated catalogs JSON on /api/catalogs", async ({
		page,
		templateUrl,
	}) => {
		const response = await page.goto(`${templateUrl}/api/catalogs`);
		expect(response?.status()).toBe(200);
		const text = await page.textContent("body");
		expect(text).toContain("totalProducts");
	});
});
