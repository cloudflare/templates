import { test, expect } from "./fixtures";

test.describe("x402 Payment-Gated Proxy Template", () => {
	test("health endpoint is accessible without payment", async ({
		page,
		templateUrl,
	}) => {
		const response = await page.goto(`${templateUrl}/__x402/health`);
		expect(response?.status()).toBe(200);

		const body = await page.textContent("body");
		expect(body).toContain("ok");
		expect(body).toContain("x402-proxy");
		expect(body).toContain("This endpoint is always public");
	});

	test("health endpoint returns valid JSON", async ({ page, templateUrl }) => {
		await page.goto(`${templateUrl}/__x402/health`);
		const content = await page.textContent("body");
		const json = JSON.parse(content || "{}");

		expect(json.status).toBe("ok");
		expect(json.proxy).toBe("x402-proxy");
		expect(json.message).toBe("This endpoint is always public");
		expect(json.timestamp).toBeGreaterThan(0);
	});

	test("protected endpoint returns 402 payment required", async ({
		page,
		templateUrl,
	}) => {
		const response = await page.goto(`${templateUrl}/__x402/protected`);
		expect(response?.status()).toBe(402);
	});

	test("402 response includes payment configuration details", async ({
		page,
		templateUrl,
	}) => {
		await page.goto(`${templateUrl}/__x402/protected`);
		const body = await page.textContent("body");

		// Verify response contains payment-related information
		expect(body).toContain("X-PAYMENT");
		expect(body).toContain("base-sepolia");
		expect(body).toContain("10000"); // Payment amount in smallest unit
	});

	test("402 response includes proper payment structure", async ({
		page,
		templateUrl,
	}) => {
		// Use page.request to get raw JSON response (avoids browser rendering)
		const response = await page.request.get(`${templateUrl}/__x402/protected`);
		expect(response.status()).toBe(402);

		const json = await response.json();

		// Verify x402 payment structure
		expect(json.error).toBe("X-PAYMENT header is required");
		expect(json.accepts).toBeDefined();
		expect(Array.isArray(json.accepts)).toBe(true);
		expect(json.accepts.length).toBeGreaterThan(0);
		expect(json.x402Version).toBe(1);

		// Verify payment details
		const paymentOption = json.accepts[0];
		expect(paymentOption.network).toBe("base-sepolia");
		expect(paymentOption.resource).toContain("/__x402/protected");
		expect(paymentOption.description).toContain("Access to premium content");
	});
});
