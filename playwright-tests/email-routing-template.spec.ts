import { expect, test } from "./fixtures";

test("serves Email Routing setup guidance", async ({ page, templateUrl }) => {
	const response = await page.goto(templateUrl);

	expect(response?.status()).toBe(200);
	await expect(
		page.getByRole("heading", {
			level: 1,
			name: "Email Routing starter",
		}),
	).toBeVisible();
	await expect(
		page.getByText("support@company.example", { exact: true }),
	).toBeVisible();
	await expect(page.getByRole("alert")).toBeVisible();
});
