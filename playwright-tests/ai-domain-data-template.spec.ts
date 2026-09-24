import { test, expect } from "./fixtures";

test.describe("AI Domain Data Template", () => {
	test("should serve domain-profile.json correctly", async ({ page, templateUrl }) => {
		// Navigate to the domain-profile.json endpoint
		const response = await page.goto(`${templateUrl}/.well-known/domain-profile.json`);

		// Check that the response is successful
		expect(response?.status()).toBe(200);

		// Check Content-Type header
		const contentType = response?.headers()["content-type"];
		expect(contentType).toContain("application/json");

		// Parse the JSON response
		const json = await response?.json();

		// Validate required fields
		expect(json).toHaveProperty("spec");
		expect(json.spec).toBe("https://ai-domain-data.org/spec/v0.1");
		expect(json).toHaveProperty("name");
		expect(json).toHaveProperty("description");
		expect(json).toHaveProperty("website");
		expect(json).toHaveProperty("contact");

		// Validate field types
		expect(typeof json.name).toBe("string");
		expect(typeof json.description).toBe("string");
		expect(typeof json.website).toBe("string");
		expect(typeof json.contact).toBe("string");

		// Validate that name and description are not empty
		expect(json.name.length).toBeGreaterThan(0);
		expect(json.description.length).toBeGreaterThan(0);
	});

	test("should include CORS headers", async ({ page, templateUrl }) => {
		const response = await page.goto(`${templateUrl}/.well-known/domain-profile.json`);

		const headers = response?.headers();
		expect(headers?.["access-control-allow-origin"]).toBe("*");
		expect(headers?.["access-control-allow-methods"]).toContain("GET");
	});

	test("should handle OPTIONS request for CORS preflight", async ({ page, templateUrl }) => {
		const response = await page.request.options(`${templateUrl}/.well-known/domain-profile.json`);

		expect(response.status()).toBe(204);
		const headers = response.headers();
		expect(headers["access-control-allow-origin"]).toBe("*");
		expect(headers["access-control-allow-methods"]).toContain("GET");
		expect(headers["access-control-allow-methods"]).toContain("OPTIONS");
	});

	test("should return 404 for non-existent paths", async ({ page, templateUrl }) => {
		const response = await page.goto(`${templateUrl}/nonexistent`);

		expect(response?.status()).toBe(404);
	});
});

