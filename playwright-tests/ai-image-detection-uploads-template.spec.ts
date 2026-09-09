import { expect, test } from "./fixtures";

test("renders the direct upload form", async ({ page, templateUrl }) => {
	await page.goto(templateUrl);
	await expect(
		page.getByRole("heading", { name: "AI Image Detection for Uploads" }),
	).toBeVisible();
	await expect(page.getByLabel("Image")).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Upload and analyze" }),
	).toBeVisible();
});
