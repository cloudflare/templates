import { test, expect } from "./fixtures";

test.describe("Mysql Hyperdrive Template", () => {
	test("should render", async ({ page, templateUrl }) => {
		await page.goto(templateUrl);

		await expect(page.locator("span")).toContainText("MySQL Manager");
		await expect(page.locator("h2")).toContainText(
			"Welcome to MySQL Hyperdrive Manager",
		);
		await expect(
			page.getByRole("button", { name: "Initialize Tables" }),
		).toBeVisible();
	});
});
