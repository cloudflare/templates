import { test, expect } from "./fixtures";

test.describe("Commerce llms.txt Template", () => {
	test("should return JSON service info on root", async ({
		page,
		templateUrl,
	}) => {
		const response = await page.goto(templateUrl);
		expect(response?.status()).toBe(200);
		const text = await page.textContent("body");
		expect(text).toContain("merchant");
		expect(text).toContain("llms.txt");
	});

	test("should serve llms.txt endpoint", async ({ page, templateUrl }) => {
		const response = await page.goto(`${templateUrl}/llms.txt`);
		expect(response?.status()).toBe(200);
		const text = await page.textContent("body");
		expect(text).toContain("Products In Stock");
	});
});
