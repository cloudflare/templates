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
		const firstBookTitle = page.getByRole("heading", { level: 3 }).first();
		await page.getByRole("combobox").selectOption("title_asc");
		await expect(firstBookTitle).toHaveText("Anna Karenina");
		await page.getByRole("combobox").selectOption("");
		await expect(firstBookTitle).toHaveText("The Brothers Karamazov");
		await page.getByRole("button", { name: "Learn more" }).first().click();
		await expect(page).toHaveURL(new URL("/book/1", templateUrl).href);
		await expect(
			page.getByRole("heading", { name: "The Brothers Karamazov", level: 1 }),
		).toBeVisible();
		await page
			.getByRole("main")
			.getByRole("link", { name: "All Books", exact: true })
			.click();
		await expect(page).toHaveURL(new URL("/", templateUrl).href);
		await expect(
			page.getByRole("heading", { name: "My Library" }),
		).toBeVisible();
	});
});
