import { test, expect } from "./fixtures";

test.describe("Agent Visibility Template", () => {
	test("should render the SPA on root", async ({ page, templateUrl }) => {
		const response = await page.goto(templateUrl);
		expect(response?.status()).toBe(200);
		await expect(
			page.getByText("AI Agent Visibility", { exact: false }).first(),
		).toBeVisible();
	});

	test("should serve the llms.txt surface", async ({ page, templateUrl }) => {
		const response = await page.goto(`${templateUrl}/llms.txt`);
		expect(response?.status()).toBe(200);
		const text = await page.textContent("body");
		expect(text).toContain("## Pages");
	});

	test("should serve the typed JSON index", async ({ page, templateUrl }) => {
		const response = await page.goto(`${templateUrl}/index.json`);
		expect(response?.status()).toBe(200);
		const text = await page.textContent("body");
		expect(text).toContain("agent-visibility");
	});

	test("should serve robots.txt welcoming AI agents", async ({
		page,
		templateUrl,
	}) => {
		const response = await page.goto(`${templateUrl}/robots.txt`);
		expect(response?.status()).toBe(200);
		const text = await page.textContent("body");
		expect(text).toContain("GPTBot");
	});
});
