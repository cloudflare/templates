import { test, expect } from "./fixtures";

test.describe("SaaS Admin Template", () => {
	test("should render as expected", async ({ page, templateUrl }) => {
		await page.goto(templateUrl);
		await expect(
			page.getByRole("heading", { name: "SaaS Admin Template" }),
		).toBeVisible();
		// Use Promise.all to click and wait for navigation simultaneously
		// This avoids actionTimeout being used for navigation wait
		await Promise.all([
			page.waitForURL(/\/admin$/),
			page.getByRole("link", { name: "Go to admin" }).click(),
		]);
		await Promise.all([
			page.waitForURL(/\/admin\/customers$/),
			page.getByRole("link", { name: "Customers", exact: true }).click(),
		]);
		await expect(
			page.getByRole("heading", { name: "Customers" }),
		).toBeVisible();
		await Promise.all([
			page.waitForURL(/\/admin\/subscriptions$/),
			page.getByRole("link", { name: "Subscriptions" }).click(),
		]);
		await expect(page.getByText("Subscriptions").nth(2)).toBeVisible();
	});
});
