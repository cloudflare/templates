import { test, expect } from "./fixtures";

test.describe("Commerce llms.txt Template", () => {
	test("should render the SPA on root", async ({ page, templateUrl }) => {
		const response = await page.goto(templateUrl);
		expect(response?.status()).toBe(200);
		// SPA renders client-side — wait for the H1 from App.tsx
		await expect(
			page.getByRole("heading", { name: "Commerce llms.txt" }),
		).toBeVisible();
	});

	test("should return JSON service info on /api", async ({
		request,
		templateUrl,
	}) => {
		const response = await request.get(`${templateUrl}/api`, {
			timeout: 60_000,
		});
		expect(response.status()).toBe(200);
		const text = await response.text();
		expect(text).toContain("merchant");
		expect(text).toContain("llms.txt");
	});

	test("should serve llms.txt endpoint", async ({ request, templateUrl }) => {
		test.setTimeout(90_000);
		const response = await request.get(`${templateUrl}/llms.txt`, {
			timeout: 60_000,
		});
		expect(response.status()).toBe(200);
		const text = await response.text();
		expect(text).toContain("Products In Stock");
	});
});
