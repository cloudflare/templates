import { test, expect } from "./fixtures";

test.describe("Browser Rendering Screenshots Template", () => {
	test("Should render the screenshot form on the home page", async ({
		page,
		templateUrl,
	}) => {
		await page.goto(templateUrl);

		await expect(
			page.getByRole("heading", { name: "Browser Rendering Screenshots" }),
		).toBeVisible();
		await expect(page.getByPlaceholder("https://example.com")).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Screenshot" }),
		).toBeVisible();
	});

	test("Should reject an invalid url parameter", async ({
		page,
		templateUrl,
	}) => {
		// The screenshot path itself requires a real headless browser (Browser
		// Rendering does not run in local simulation), but URL validation runs in
		// the Worker and is deterministic, so it is safe to assert locally.
		const response = await page.goto(`${templateUrl}/?url=not-a-valid-url`);

		expect(response?.status()).toBe(400);
		await expect(page.locator("body")).toContainText("Invalid");
	});
});
