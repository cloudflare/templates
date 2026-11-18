import { test, expect } from "./fixtures";

test("serves the build notification setup UI", async ({
	page,
	templateUrl,
}) => {
	await page.goto(templateUrl);
	await expect(
		page.getByRole("heading", { name: "Workers Builds Notifications" }),
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "Event Types" }),
	).toBeVisible();
});
