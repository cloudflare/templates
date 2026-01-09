// Workers for Platforms Template - Test Suite
// Tests the core functionality of the website hosting platform

import {
	env,
	createExecutionContext,
	waitOnExecutionContext,
} from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import app from "../src/index";

// Type for our test environment
interface TestEnv {
	DB: D1Database;
	dispatcher: {
		get: (name: string) => { fetch: (req: Request) => Promise<Response> };
	};
	DISPATCH_NAMESPACE_NAME: string;
	CUSTOM_DOMAIN: string;
}

describe("Workers for Platforms Template", () => {
	// Helper to make requests to the app
	async function makeRequest(
		path: string,
		options?: RequestInit,
	): Promise<Response> {
		const request = new Request(`http://localhost${path}`, options);
		const ctx = createExecutionContext();
		const response = await app.fetch(request, env as unknown as TestEnv, ctx);
		await waitOnExecutionContext(ctx);
		return response;
	}

	describe("Homepage", () => {
		it("should return the website builder UI on the root path", async () => {
			const response = await makeRequest("/");

			expect(response.status).toBe(200);
			expect(response.headers.get("content-type")).toContain("text/html");

			const html = await response.text();
			expect(html).toContain("Build a Website");
			expect(html).toContain("projectForm");
		});

		it("should include the tab switcher for code/upload modes", async () => {
			const response = await makeRequest("/");
			const html = await response.text();

			expect(html).toContain("Write Code");
			expect(html).toContain("Upload Files");
			expect(html).toContain("tab-switcher");
		});

		it("should include the default Worker code template", async () => {
			const response = await makeRequest("/");
			const html = await response.text();

			expect(html).toContain("export default");
			expect(html).toContain("async fetch(request, env, ctx)");
		});
	});

	describe("Admin Dashboard", () => {
		it("should return the admin dashboard page", async () => {
			const response = await makeRequest("/admin");

			expect(response.status).toBe(200);
			expect(response.headers.get("content-type")).toContain("text/html");

			const html = await response.text();
			expect(html).toContain("Admin Dashboard");
		});

		it("should show projects section on admin page", async () => {
			const response = await makeRequest("/admin");
			const html = await response.text();

			// Check for admin page elements that are always present
			expect(html).toContain("Admin Dashboard");
			expect(html).toContain("Projects");
			// When empty, shows "No projects yet" message
			expect(html).toMatch(/(Subdomain|No projects yet)/);
		});
	});

	describe("Project Creation API", () => {
		it("should reject requests without required fields", async () => {
			const response = await makeRequest("/projects", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});

			expect(response.status).toBe(400);
			const text = await response.text();
			expect(text).toContain("Missing required fields");
		});

		it("should reject invalid subdomain format", async () => {
			const response = await makeRequest("/projects", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: "Test Project",
					subdomain: "Invalid_Subdomain!",
					script_content:
						"export default { fetch() { return new Response('ok'); } }",
				}),
			});

			expect(response.status).toBe(400);
			const text = await response.text();
			expect(text).toContain("lowercase letters, numbers, and hyphens");
		});

		it("should require either script_content or assets", async () => {
			const response = await makeRequest("/projects", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: "Test Project",
					subdomain: "test-project",
				}),
			});

			expect(response.status).toBe(400);
			const text = await response.text();
			expect(text).toContain("script_content or assets");
		});
	});

	describe("Static Assets", () => {
		it("should return empty response for favicon", async () => {
			const response = await makeRequest("/favicon.ico");

			expect(response.status).toBe(200);
			const body = await response.text();
			expect(body).toBe("");
		});
	});

	describe("Database Initialization", () => {
		it("should handle /init endpoint for database reset", async () => {
			// Note: This test verifies the endpoint exists and redirects
			// In a real test with proper mocking, we'd verify the database operations
			const response = await makeRequest("/init", { redirect: "manual" });

			// Should redirect back to root after initialization
			expect(response.status).toBe(302);
			expect(response.headers.get("location")).toContain("/");
		});
	});
});

describe("Input Validation", () => {
	async function makeRequest(
		path: string,
		options?: RequestInit,
	): Promise<Response> {
		const request = new Request(`http://localhost${path}`, options);
		const ctx = createExecutionContext();
		const response = await app.fetch(request, env as unknown as TestEnv, ctx);
		await waitOnExecutionContext(ctx);
		return response;
	}

	it("should accept valid subdomain with hyphens", async () => {
		const response = await makeRequest("/projects", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				name: "My Test Site",
				subdomain: "my-test-site",
				script_content:
					"export default { fetch() { return new Response('ok'); } }",
			}),
		});

		// Will fail due to missing env config in test, but validates input first
		const text = await response.text();
		// Should NOT contain subdomain validation error
		expect(text).not.toContain("lowercase letters, numbers, and hyphens");
	});

	it("should accept valid subdomain with numbers", async () => {
		const response = await makeRequest("/projects", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				name: "Site 123",
				subdomain: "site123",
				script_content:
					"export default { fetch() { return new Response('ok'); } }",
			}),
		});

		const text = await response.text();
		expect(text).not.toContain("lowercase letters, numbers, and hyphens");
	});
});

// Type declaration for test environment
interface TestEnv {
	DB: D1Database;
	dispatcher: {
		get: (name: string) => { fetch: (req: Request) => Promise<Response> };
	};
	DISPATCH_NAMESPACE_NAME: string;
	CUSTOM_DOMAIN: string;
}
