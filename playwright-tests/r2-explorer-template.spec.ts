import { test, expect } from "./fixtures";

test.describe("R2 Explorer Template", () => {
	test("should work as expected", async ({ page, templateUrl }) => {
		await page.goto(templateUrl);
		await expect(page.getByText("R2-Explorer")).toBeVisible();
		await expect(page.getByRole("button", { name: "Read only" })).toBeVisible();
		await expect(
			page.getByRole("heading", { name: "This folder is empty" }),
		).toBeVisible();
	});
});
