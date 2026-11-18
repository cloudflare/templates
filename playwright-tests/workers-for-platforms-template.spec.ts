import { test, expect } from "./fixtures";

test("serves the local website builder without remote platform bindings", async ({
	page,
	templateUrl,
}) => {
	await page.goto(templateUrl);
	await expect(
		page.getByRole("heading", { name: "Build a Website" }),
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: /Create|Build/i }),
	).toBeVisible();
});
