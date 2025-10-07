import { test, expect } from "./fixtures";

test.describe("React Router Postgres SSR Template", () => {
	test("should work as expected", async ({ page, templateUrl }) => {
		await page.goto(templateUrl);
		await expect(
			page.getByRole("heading", { name: "My Library" }),
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
		await page.getByRole("button", { name: "Learn more" }).first().click();
		await expect(page.getByText("All Books>")).toBeVisible();
	});
});
