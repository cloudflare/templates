import { test, expect } from "./fixtures";

test.describe("Vite React Template", () => {
	test("should have working React interactions", async ({
		page,
		templateUrl,
	}) => {
		await page.goto(templateUrl);

		await expect(
			page.getByRole("heading", { name: "Vite + React + Hono +" }),
		).toBeVisible();
		await expect(page.getByLabel("increment")).toContainText("count is 0");
		await page.getByRole("button", { name: "increment" }).click();
		await expect(page.getByLabel("increment")).toContainText("count is 1");
		await expect(page.getByLabel("get name")).toContainText(
			"Name from API is: unknown",
		);
		await page.getByRole("button", { name: "get name" }).click();
		await expect(page.getByLabel("get name")).toContainText(
			"Name from API is: Cloudflare",
		);
	});
});
