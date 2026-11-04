import { test, expect } from "./fixtures";

test.describe("Xquik Post Monitor Template", () => {
	test("shows labelled sample posts in demo mode", async ({
		page,
		templateUrl,
	}) => {
		await page.goto(templateUrl);

		await expect(
			page.getByRole("heading", { level: 1, name: "Xquik Post Monitor" }),
		).toBeVisible();
		await expect(page.getByRole("alert")).toContainText("Demo mode");
		await expect(
			page.getByRole("heading", { name: "Sample data" }),
		).toBeVisible();
		await expect(page.getByText("Sample", { exact: true })).toHaveCount(3);
		await expect(
			page.getByText(
				'Xquik is an independent third-party service. Not affiliated with X Corp. "Twitter" and "X" are trademarks of X Corp.',
			),
		).toBeVisible();
	});

	test("returns 404 for an unknown path", async ({ request, templateUrl }) => {
		const response = await request.get(`${templateUrl}/missing`);

		expect(response.status()).toBe(404);
	});
});
