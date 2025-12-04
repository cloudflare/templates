import { test, expect } from "./fixtures";

test.describe("SaaS Admin Template", () => {
	test("should render as expected", async ({ page, templateUrl }) => {
		await page.goto(templateUrl);
		await expect(
			page.getByRole("heading", { name: "SaaS Admin Template" }),
		).toBeVisible();
		await page.getByRole("link", { name: "Go to admin" }).click();
		await page.getByRole("link", { name: "Customers", exact: true }).click();
		await expect(
			page.getByRole("heading", { name: "Customers" }),
		).toBeVisible();
		await page.getByRole("link", { name: "Subscriptions" }).click();
		await expect(page.getByText("Subscriptions").nth(2)).toBeVisible();
	});
});
