import { test, expect } from "./fixtures";

test.describe("Newsletter Template", () => {
	test("signup page loads with name and email fields", async ({
		page,
		templateUrl,
	}) => {
		await page.goto(templateUrl);
		await expect(
			page.getByRole("heading", { name: "Subscribe to the newsletter" }),
		).toBeVisible();
		await expect(page.locator('input[name="name"]')).toBeVisible();
		await expect(page.locator('input[name="email"]')).toBeVisible();
	});

	test("visitor can subscribe", async ({ page, templateUrl }) => {
		await page.goto(templateUrl);
		await page.fill('input[name="email"]', `pw+${Date.now()}@example.com`);
		await page.getByRole("button", { name: "Subscribe" }).click();
		await expect(page.locator("#m")).toContainText("Thanks");
	});

	test("embeddable form is served", async ({ page, templateUrl }) => {
		await page.goto(new URL("/embed", templateUrl).href);
		await expect(page.locator('input[name="email"]')).toBeVisible();
	});

	test("admin page is served", async ({ page, templateUrl }) => {
		await page.goto(new URL("/admin", templateUrl).href);
		await expect(
			page.getByRole("heading", { name: "Send a campaign" }),
		).toBeVisible();
	});
});
