import { test, expect } from "./fixtures";

test.describe("Multiplayer Globe Template", () => {
	test("Should work as expected", async ({ page, templateUrl }) => {
		await page.goto(templateUrl);
		await expect(
			page.getByRole("heading", { name: "Where's everyone at?" }),
		).toBeVisible();
		await expect(
			page.getByText(/\d+ (?:person|people) connected\./),
		).toBeVisible();
		await expect(page.locator("canvas")).toBeVisible();
	});
});
