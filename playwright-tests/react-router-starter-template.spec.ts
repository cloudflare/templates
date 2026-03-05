import { test, expect } from "./fixtures";

test.describe("React Router Starter Template", () => {
	test("should render as expected", async ({ page, templateUrl }) => {
		await page.goto(templateUrl);
		await expect(page.getByRole("img", { name: "React Router" })).toBeVisible();
		await expect(page.getByText("Hello from Cloudflare")).toBeVisible();
	});
});
