import { test, expect } from "./fixtures";

test.describe("Remix Starter Template", () => {
	test("should render as expected", async ({ page, templateUrl }) => {
		await page.goto(templateUrl);
		await expect(page.getByRole("img", { name: "Remix" })).toBeVisible();
		await expect(page.getByText("What's next?")).toBeVisible();
	});
});
