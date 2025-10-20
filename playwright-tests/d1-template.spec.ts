import { test, expect } from "./fixtures";

test.describe("D1 Template", () => {
	test("should work correctly", async ({ page, templateUrl }) => {
		await page.goto(templateUrl);

		await expect(
			page.getByRole("heading", { name: "🎉 Successfully connected d1-" }),
		).toBeVisible();
		await expect(page.locator("pre")).toBeVisible();
		await expect(page.getByText("> SELECT * FROM comments")).toBeVisible();
		await expect(
			page.getByText(`{
    "id": 1,
    "author": "Kristian",
    "content": "Congrats!"
  }`),
		).toBeVisible();
	});
});
