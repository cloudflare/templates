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

	test("should serve the llms.txt surface", async ({
		request,
		templateUrl,
	}) => {
		test.setTimeout(90_000);
		const response = await request.get(`${templateUrl}/llms.txt`, {
			timeout: 60_000,
		});
		expect(response.status()).toBe(200);
		const text = await response.text();
		expect(text).toContain("## Pages");
	});

	test("should serve the typed JSON index", async ({
		request,
		templateUrl,
	}) => {
		test.setTimeout(90_000);
		const response = await request.get(`${templateUrl}/index.json`, {
			timeout: 60_000,
		});
		expect(response.status()).toBe(200);
		const text = await response.text();
		expect(text).toContain("agent-visibility");
	});

	test("should serve robots.txt welcoming AI agents", async ({
		request,
		templateUrl,
	}) => {
		test.setTimeout(90_000);
		const response = await request.get(`${templateUrl}/robots.txt`, {
			timeout: 60_000,
		});
		expect(response.status()).toBe(200);
		const text = await response.text();
		expect(text).toContain("GPTBot");
	});
});
