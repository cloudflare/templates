import { test, expect } from "./fixtures";

test.describe("Next.js Starter Template", () => {
	test("should render", async ({ page, templateUrl }) => {
		await page.goto(templateUrl);

		// Check for Next.js specific elements
		await expect(page).toHaveTitle(/Next.js|Create Next App/i);
		await expect(page.getByRole("img", { name: "Next.js logo" })).toBeVisible();
		await expect(page.getByText("Get started by editing src/")).toBeVisible();
		await expect(
			page.getByRole("link", { name: "Read our docs" }),
		).toBeVisible();
	});
});
