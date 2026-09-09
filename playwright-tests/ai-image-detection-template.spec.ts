import { expect, test } from "./fixtures";

test("renders the image detection form", async ({ page, templateUrl }) => {
	await page.goto(templateUrl);
	await expect(
		page.getByRole("heading", { name: "AI Image Detection" }),
	).toBeVisible();
	await expect(page.getByLabel("Public HTTPS image URL")).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Analyze image" }),
	).toBeVisible();
});
