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
		const response = await page.goto(`${templateUrl}/__x402/protected`);
		const body = await page.textContent("body");

		expect(response?.status()).toBe(402);
		expect(response?.headers()["payment-required"]).toBeDefined();
		expect(body).toContain("Payment Required");
		expect(body).toContain("install");
		expect(body).toContain("@x402/paywall");
	});

	test("402 response includes proper payment structure", async ({
		page,
		templateUrl,
	}) => {
		// API requests receive an empty JSON body; v2 requirements are in the header.
		const response = await page.request.get(`${templateUrl}/__x402/protected`);
		expect(response.status()).toBe(402);

		expect(await response.json()).toEqual({});
		const encodedRequirements = response.headers()["payment-required"];
		expect(encodedRequirements).toBeDefined();
		const requirements = JSON.parse(
			Buffer.from(encodedRequirements, "base64").toString("utf8"),
		);

		expect(requirements.x402Version).toBe(2);
		expect(requirements.accepts).toHaveLength(2);
		expect(requirements.accepts[0].network).toBe("eip155:84532");
		expect(requirements.accepts[0].amount).toBe("10000");
		expect(requirements.accepts[1].network).toBe(
			"solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
		);
		expect(requirements.accepts[1].payTo).toBe(
			"1nc1nerator11111111111111111111111111111111",
		);
		expect(requirements.accepts[1].extra?.feePayer).toBeDefined();
		expect(requirements.resource.url).toContain("/__x402/protected");
		expect(requirements.resource.description).toBe(
			"Access to test protected endpoint",
		);
	});
});
