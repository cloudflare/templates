import { test, expect } from "./fixtures";

test.describe("Hello World Durable Object Template", () => {
	test("Should work as expected", async ({ page, templateUrl }) => {
		await page.goto(templateUrl);

		await expect(page.getByText("Hello, World!")).toBeVisible();
	});
});
