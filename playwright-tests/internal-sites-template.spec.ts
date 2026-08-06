import { test, expect } from "./fixtures";

test.describe("Internal Sites Template", () => {
	test("should render the deploy page", async ({ page, templateUrl }) => {
		await page.goto(templateUrl);
		// Root redirects to /deploy
		await page.waitForURL(/\/deploy$/);
		await expect(
			page.getByRole("heading", { name: "Upload and deploy" }),
		).toBeVisible();
	});

	test("should show the deploy button", async ({ page, templateUrl }) => {
		await page.goto(`${templateUrl}/deploy`);
		await expect(
			page.getByRole("button", { name: "Deploy site" }),
		).toBeVisible();
	});

	test("should show drag-and-drop instructions", async ({
		page,
		templateUrl,
	}) => {
		await page.goto(`${templateUrl}/deploy`);
		await expect(page.getByText("Drop a folder. Or a zip.")).toBeVisible();
	});
});
