import { test, expect } from "./fixtures";

test.describe("Brand Visibility Worker Template", () => {
	test("API - /api/models endpoint returns all 5 models", async ({
		page,
		templateUrl,
	}) => {
		const response = await page.request.get(`${templateUrl}/api/models`);
		expect(response.ok()).toBeTruthy();

		const data = await response.json();
		expect(data.total).toBe(5);
		expect(data.models).toHaveLength(5);

		// Verify all 5 models are present
		const modelIds = data.models.map((m: any) => m.id);
		expect(modelIds).toContain("openai/gpt-5.4-nano");
		expect(modelIds).toContain("anthropic/claude-sonnet-4");
		expect(modelIds).toContain("google/gemini-3-flash");
		expect(modelIds).toContain("@cf/meta/llama-4-scout-17b-16e-instruct");
		expect(modelIds).toContain("@cf/mistralai/mistral-small-3.1-24b-instruct");

		// Verify each model has required fields
		for (const model of data.models) {
			expect(model).toHaveProperty("id");
			expect(model).toHaveProperty("name");
			expect(model).toHaveProperty("provider");
			expect(typeof model.id).toBe("string");
			expect(typeof model.name).toBe("string");
			expect(typeof model.provider).toBe("string");
		}
	});

	test("UI - Homepage/Results page loads", async ({ page, templateUrl }) => {
		await page.goto(templateUrl);

		// Verify page loads and key elements are visible
		await expect(page.locator("body")).toBeVisible();

		// Check for navigation or main UI elements
		// The page should either show an empty state or results table
		const hasEmptyState = await page
			.locator("text=/No test results|Add a site|Get started/i")
			.isVisible()
			.catch(() => false);
		const hasResults = await page
			.locator("table, [role='table']")
			.isVisible()
			.catch(() => false);

		// At least one of these should be visible
		expect(hasEmptyState || hasResults).toBeTruthy();
	});

	test("UI - Setup wizard page loads", async ({ page, templateUrl }) => {
		await page.goto(`${templateUrl}/setup`);

		// Verify setup page heading
		await expect(
			page.getByRole("heading", { name: /Add Site|New Site|Setup/i }),
		).toBeVisible();

		// Verify domain input field exists
		const domainInput = page.locator('input[type="text"]').first();
		await expect(domainInput).toBeVisible();

		// Verify wizard UI renders
		await expect(page.locator("body")).toContainText(/domain|site|website/i);
	});

	test("UI - Models selection page loads", async ({
		page,
		templateUrl,
	}) => {
		// Create a test site first
		const testDomain = "test.example.com";
		const createResponse = await page.request.post(
			`${templateUrl}/api/sites`,
			{
				data: { domain: testDomain },
			},
		);
		expect(createResponse.ok()).toBeTruthy();

		// Navigate to models page
		await page.goto(`${templateUrl}/models?site=${testDomain}`);

		// Verify models page loads
		await expect(
			page.getByRole("heading", { name: /models|select models/i }),
		).toBeVisible();

		// Verify model selection UI is present
		// Look for checkboxes, buttons, or model names
		const hasModelUI =
			(await page
				.locator('input[type="checkbox"]')
				.count()
				.catch(() => 0)) > 0 ||
			(await page.locator("text=/GPT|Claude|Gemini|Llama|Mistral/i").count()) >
				0;

		expect(hasModelUI).toBeTruthy();
	});

	test("UI - Prompts management page loads", async ({
		page,
		templateUrl,
	}) => {
		// Create a test site first
		const testDomain = "test2.example.com";
		const createResponse = await page.request.post(
			`${templateUrl}/api/sites`,
			{
				data: { domain: testDomain },
			},
		);
		expect(createResponse.ok()).toBeTruthy();

		// Navigate to prompts page
		await page.goto(`${templateUrl}/prompts?site=${testDomain}`);

		// Verify prompts page loads
		await expect(
			page.getByRole("heading", { name: /prompts|test prompts/i }),
		).toBeVisible();

		// Verify prompt management UI is present
		// Look for input fields, add buttons, or prompt list
		const hasPromptUI =
			(await page
				.locator('input[type="text"], textarea')
				.count()
				.catch(() => 0)) > 0 ||
			(await page
				.locator('button:has-text("Add"), button:has-text("Generate")')
				.count()) > 0;

		expect(hasPromptUI).toBeTruthy();
	});
});
