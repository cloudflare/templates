import { test, expect } from "./fixtures";

test.describe("Agent Visibility Template", () => {
	test("should render the SPA on root", async ({ page, templateUrl }) => {
		const response = await page.goto(templateUrl);
		expect(response?.status()).toBe(200);
		await expect(
			page.getByText("AI Agent Visibility", { exact: false }).first(),
		).toBeVisible();
	});

	test("should show an actionable site metadata error", async ({
		page,
		templateUrl,
	}) => {
		await page.route("**/api/site", async (route) => {
			await route.fulfill({ status: 503, body: "Service unavailable" });
		});

		const response = await page.goto(templateUrl);
		expect(response?.status()).toBe(200);
		await expect(page.getByRole("alert")).toContainText(
			"Could not load site metadata.",
		);
		await expect(page.getByRole("alert")).toContainText(
			"/api/site returned 503",
		);
	});

	test("should show an actionable indexed pages error", async ({
		page,
		templateUrl,
	}) => {
		await page.route("**/api/resources", async (route) => {
			await route.fulfill({ status: 502, body: "Bad gateway" });
		});

		const response = await page.goto(templateUrl);
		expect(response?.status()).toBe(200);
		await expect(page.getByRole("alert")).toContainText(
			"Could not load indexed pages.",
		);
		await expect(page.getByRole("alert")).toContainText(
			"/api/resources returned 502",
		);
	});

	test("should show invalid JSON errors in surface preview", async ({
		page,
		templateUrl,
	}) => {
		await page.route("**/index.json", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: "not valid json",
			});
		});

		const response = await page.goto(templateUrl);
		expect(response?.status()).toBe(200);
		const surface = page.locator(".surface").filter({ hasText: "index.json" });
		await surface.getByRole("button", { name: "Preview" }).click();
		await expect(surface.getByRole("alert")).toContainText(
			"Preview unavailable.",
		);
		await expect(surface.getByRole("alert")).toContainText(
			"/index.json returned invalid JSON",
		);
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
