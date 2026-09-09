import { expect, test } from "./fixtures";

test("renders the provenance analysis form", async ({ page, templateUrl }) => {
	await page.goto(templateUrl);
	await expect(
		page.getByRole("heading", { name: "AI Image Provenance Checker" }),
	).toBeVisible();
	await expect(page.getByText("C2PA manifest validation")).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Start analysis" }),
	).toBeVisible();
});
