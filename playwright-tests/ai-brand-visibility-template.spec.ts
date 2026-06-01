import { test, expect } from "./fixtures";

test.describe("AI Brand Visibility Template", () => {
	test("loads dashboard and setup flow", async ({ page, templateUrl }) => {
		await page.goto(templateUrl);
		await expect(
			page.getByRole("heading", { name: "No site selected" }),
		).toBeVisible();
		await expect(page.getByRole("link", { name: "Add site" })).toBeVisible();

		await page.goto(`${templateUrl}/setup`);
		await expect(
			page.getByRole("heading", { name: "Brand Visibility Worker Template" }),
		).toBeVisible();
		await expect(page.getByText("Enter your site")).toBeVisible();
		await expect(page.getByPlaceholder("yourdomain.com")).toBeVisible();
	});
});
