import { expect, test } from "./fixtures";

test.describe("Cloudflare Docs Voice Agent Template", () => {
	test("renders the backend status page without exposing a token field", async ({
		page,
		templateUrl,
	}) => {
		const response = await page.goto(templateUrl);

		expect(response?.status()).toBe(200);
		await expect(
			page.getByRole("heading", { name: "Cloudflare Docs Voice Agent" }),
		).toBeVisible();
		await expect(page.getByText("Flux -> GPT-OSS 20B")).toBeVisible();
		await expect(page.locator("input")).toHaveCount(0);
	});

	test("serves the fixed pipeline health response", async ({
		request,
		templateUrl,
	}) => {
		const response = await request.get(`${templateUrl}/health`);

		expect(response.status()).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			status: "ok",
			agent: "arya",
			pipeline: {
				stt: "flux",
				llm: "@cf/openai/gpt-oss-20b",
				tts: "aura-1",
				voice: "asteria",
			},
		});
	});
});
