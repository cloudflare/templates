import { test, expect } from "./fixtures";

test.describe("LLM Chat App Template", () => {
	test("Should work as expected", async ({ page, templateUrl }) => {
		await page.goto(templateUrl);

		await expect(
			page.getByRole("heading", { name: "Cloudflare AI Chat" }),
		).toBeVisible();
		await expect(
			page.getByText("Powered by Cloudflare Workers AI", { exact: true }),
		).toBeVisible();
		await expect(page.getByText("Hello! I'm an LLM chat app")).toBeVisible();
		await page
			.getByRole("textbox", { name: "Type your message here..." })
			.click();
		await page
			.getByRole("textbox", { name: "Type your message here..." })
			.fill("test message");
		await page.getByRole("button", { name: "Send" }).click();
		await expect(
			page.locator("div").filter({ hasText: /^test message$/ }),
		).toBeVisible();
		await expect(page.locator("#chat-messages div").nth(2)).toBeVisible();
	});

	test("Shows message text as text, not HTML", async ({
		page,
		templateUrl,
	}) => {
		const message = '<img src="x" id="injected">';
		await page.goto(templateUrl);
		await page
			.getByRole("textbox", { name: "Type your message here..." })
			.fill(message);
		await page.getByRole("button", { name: "Send" }).click();
		await expect(
			page.locator("#chat-messages").getByText(message, { exact: true }),
		).toBeVisible();
		await expect(page.locator("#injected")).toHaveCount(0);
	});
});
