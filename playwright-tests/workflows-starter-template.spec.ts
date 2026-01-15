import { test, expect } from "./fixtures";

test.describe("Workflows Starter Template", () => {
	test("should load the workflow visualization", async ({
		page,
		templateUrl,
	}) => {
		await page.goto(templateUrl);

		await expect(
			page.getByRole("heading", { name: "Workflows" }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "START", exact: true }),
		).toBeVisible();
	});
});
