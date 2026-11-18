import { test, expect } from "./fixtures";

test.describe("React Starter Template", () => {
	test("should have working React interactions and API", async ({
		page,
		templateUrl,
	}) => {
		await page.goto(templateUrl);

		await expect(
			page.getByRole("heading", { name: "Get started with Cloudflare" }),
		).toBeVisible();

		const counter = page.getByRole("button", { name: /Count is/i });
		await expect(counter).toContainText("Count is 0");
		await counter.click();
		await expect(counter).toContainText("Count is 1");

		const apiButton = page.getByLabel("get name");
		await expect(apiButton).toContainText("Name from API is: unknown");
		await apiButton.click();
		await expect(apiButton).toContainText("Name from API is: Cloudflare");
	});
});
