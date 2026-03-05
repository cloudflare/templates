import { test, expect } from "./fixtures";

test.describe("React Postgres Fullstack Template", () => {
	test("should work as expected", async ({ page, templateUrl }) => {
		await page.goto(templateUrl);
		await expect(
			page.getByRole("heading", { name: "My Library" }),
		).toBeVisible();
		await expect(
			page
				.locator("div")
				.filter({ hasText: "Demo Mode: Using Mock DataYou" })
				.nth(3),
		).toBeVisible();
		await expect(
			page.getByRole("img", { name: "The Brothers Karamazov" }),
		).toBeVisible();
		await expect(page.getByRole("img", { name: "East of Eden" })).toBeVisible();
		await page.getByRole("combobox").selectOption("title_asc");
		await expect(
			page.getByRole("img", { name: "Anna Karenina" }),
		).toBeVisible();
		await page.getByRole("combobox").selectOption("");
		await page.getByRole("link", { name: "Historical Fiction(2)" }).click();
		await expect(
			page.getByRole("img", { name: "Giovanni's Room" }),
		).toBeVisible();
		await page.getByRole("button", { name: "Learn more" }).first().click();
		await expect(page.getByText("All Books>")).toBeVisible();
	});
});
