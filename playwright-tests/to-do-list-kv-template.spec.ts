import { test, expect } from "./fixtures";

test.describe("To-Do List KV Template", () => {
	test("should have working to-do functionality", async ({
		page,
		templateUrl,
	}) => {
		await page.goto(templateUrl);

		await expect(
			page.getByRole("heading", { name: "Todo List" }),
		).toBeVisible();
		await page.getByRole("textbox", { name: "Add a new todo..." }).click();
		await page
			.getByRole("textbox", { name: "Add a new todo..." })
			.fill("Test to do");
		await page.getByRole("button", { name: "Add" }).click();
		await expect(page.getByText("Test to doDelete")).toBeVisible();
		await page.getByRole("button", { name: "Delete" }).click();
		await expect(page.getByText("Test to doDelete")).not.toBeVisible();
	});
});
