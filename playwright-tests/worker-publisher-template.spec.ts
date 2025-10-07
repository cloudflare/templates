import { test, expect } from "./fixtures";

test.describe("Worker Publisher Template", () => {
	test("should render the UI", async ({ page, templateUrl }) => {
		await page.goto(templateUrl);

		await expect(
			page.getByRole("heading", { name: "Worker Publisher" }),
		).toBeVisible();
		await expect(page.getByRole("button")).toContainText("Deploy Worker");
	});
});
