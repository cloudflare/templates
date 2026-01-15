import { test, expect } from "./fixtures";

test.describe("OpenAuth Template", () => {
	test("should work as expected", async ({ page, templateUrl }) => {
		await page.goto(templateUrl);
		await expect(page.getByRole("img")).toBeVisible();
		await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible();
		await expect(page.getByRole("textbox", { name: "Password" })).toBeVisible();
		await page.getByRole("link", { name: "Register" }).click();
		await page.getByRole("textbox", { name: "Email" }).click();
		await page.getByRole("textbox", { name: "Email" }).fill("test@test.com");
		await page.getByRole("textbox", { name: "Password", exact: true }).click();
		await page
			.getByRole("textbox", { name: "Password", exact: true })
			.fill("test123");
		await page.getByRole("textbox", { name: "Repeat password" }).click();
		await page
			.getByRole("textbox", { name: "Repeat password" })
			.fill("test123");
		await page.getByRole("button", { name: "Continue" }).click();
		await expect(
			page.getByRole("textbox", { name: "Code (check Worker logs)" }),
		).toBeVisible();
		await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
	});
});
