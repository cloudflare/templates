import { test, expect } from "./fixtures";

test.describe("Durable Chat Template", () => {
	test("Should work as expected", async ({ page, templateUrl }) => {
		await page.goto(templateUrl);

		await expect(
			page.getByRole("heading", { name: "Chat, powered by Durable" }),
		).toBeVisible();
		await page.getByRole("textbox").click();
		await page.getByRole("textbox").fill("test message");
		await page.getByRole("button", { name: "Send" }).click();
		await expect(page.getByText("test message")).toBeVisible();
	});
});
