import { test, expect } from "./fixtures";

test.describe("AI Brand Visibility Template", () => {
	test("API - /api/models endpoint returns all 5 models", async ({
		page,
		templateUrl,
	}) => {
		const response = await page.request.get(`${templateUrl}/api/models`);
		expect(response.ok()).toBeTruthy();

		const data = await response.json();
		expect(data.total).toBe(5);
		expect(data.models).toHaveLength(5);

		const modelIds = data.models.map((model: { id: string }) => model.id);
		expect(modelIds).toContain("openai/gpt-5.4-nano");
		expect(modelIds).toContain("anthropic/claude-sonnet-4");
		expect(modelIds).toContain("google/gemini-3-flash");
		expect(modelIds).toContain("@cf/meta/llama-4-scout-17b-16e-instruct");
		expect(modelIds).toContain("@cf/mistralai/mistral-small-3.1-24b-instruct");

		for (const model of data.models) {
			expect(model).toHaveProperty("id");
			expect(model).toHaveProperty("name");
			expect(model).toHaveProperty("provider");
			expect(typeof model.id).toBe("string");
			expect(typeof model.name).toBe("string");
			expect(typeof model.provider).toBe("string");
		}
	});

	test("loads dashboard and setup flow", async ({ page, templateUrl }) => {
		await page.goto(templateUrl);
		await expect(page.getByText("AI Brand Visibility Template")).toBeVisible();
		await expect(page.getByRole("link", { name: "Add site" })).toBeVisible();

		await page.goto(`${templateUrl}/setup`);
		await expect(
			page.getByRole("heading", { name: "AI Brand Visibility Template" }),
		).toBeVisible();
		await expect(page.getByText("Enter your site")).toBeVisible();
		await expect(page.getByPlaceholder("yourdomain.com")).toBeVisible();
	});

	test("models page loads after creating a site", async ({
		page,
		templateUrl,
	}) => {
		const testDomain = "models.example.com";
		const createResponse = await page.request.post(`${templateUrl}/api/sites`, {
			data: { domain: testDomain },
		});
		expect(createResponse.ok()).toBeTruthy();

		await page.goto(`${templateUrl}/models?site=${testDomain}`);

		await expect(page.getByRole("heading", { name: "Models" })).toBeVisible();
		await expect(
			page.getByRole("cell", { name: "GPT-5.4 Nano" }),
		).toBeVisible();
	});

	test("prompts page loads after creating a site", async ({
		page,
		templateUrl,
	}) => {
		const testDomain = "prompts.example.com";
		const createResponse = await page.request.post(`${templateUrl}/api/sites`, {
			data: { domain: testDomain },
		});
		expect(createResponse.ok()).toBeTruthy();

		await page.goto(`${templateUrl}/prompts?site=${testDomain}`);

		await expect(page.getByRole("heading", { name: "Prompts" })).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Generate suggestions" }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Add prompt" }),
		).toBeVisible();
	});
});
