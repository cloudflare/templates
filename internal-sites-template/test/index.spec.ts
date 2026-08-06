import {
	createExecutionContext,
	env,
	waitOnExecutionContext,
} from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../src/index";

describe("Internal Sites Platform", () => {
	// ── Deploy page ──────────────────────────────────────────────────────

	it("serves the deploy page on localhost (testing mode)", async () => {
		const request = new Request("http://localhost/deploy");
		const ctx = createExecutionContext();
		const response = await app.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		const body = await response.text();
		expect(body).toContain("Upload and deploy");
		expect(body).toContain("Deploy site");
		expect(body).toContain("Drop a folder. Or a zip.");
	});

	it("serves the deploy page on workers.dev (testing mode)", async () => {
		const request = new Request(
			"https://my-worker.my-account.workers.dev/deploy",
		);
		const ctx = createExecutionContext();
		const response = await app.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		const body = await response.text();
		expect(body).toContain("Upload and deploy");
	});

	it("serves the deploy page with Access identity on custom domain", async () => {
		const request = new Request("https://mycompany.com/deploy", {
			headers: {
				"Cf-Access-Authenticated-User-Email": "test@company.com",
			},
		});
		const customEnv = {
			...env,
			SITE_DOMAIN: "mycompany.com",
		};
		const ctx = createExecutionContext();
		const response = await app.fetch(request, customEnv, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		const body = await response.text();
		expect(body).toContain("Upload and deploy");
	});

	it("redirects / to /deploy", async () => {
		const request = new Request("http://localhost/");
		const ctx = createExecutionContext();
		const response = await app.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe("/deploy");
	});

	// ── Access enforcement on custom domain ──────────────────────────────

	it("returns 401 on custom domain without Access identity", async () => {
		const request = new Request("https://mycompany.com/deploy");
		const customEnv = {
			...env,
			SITE_DOMAIN: "mycompany.com",
		};
		const ctx = createExecutionContext();
		const response = await app.fetch(request, customEnv, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(401);
		const body = await response.text();
		expect(body).toContain("Company sign-in is required");
	});

	it("returns 401 on custom domain API route without Access identity", async () => {
		const request = new Request("https://mycompany.com/api/sites/test");
		const customEnv = {
			...env,
			SITE_DOMAIN: "mycompany.com",
		};
		const ctx = createExecutionContext();
		const response = await app.fetch(request, customEnv, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(401);
	});

	// ── Testing mode allows access without identity ──────────────────────

	it("allows access on localhost without Access identity", async () => {
		const request = new Request("http://localhost/deploy");
		const ctx = createExecutionContext();
		const response = await app.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
	});

	it("allows access on workers.dev without Access identity", async () => {
		const request = new Request(
			"https://my-worker.my-account.workers.dev/deploy",
		);
		const ctx = createExecutionContext();
		const response = await app.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
	});

	// ── API validation ───────────────────────────────────────────────────

	it("returns 400 when deploying with no files", async () => {
		const formData = new FormData();
		formData.set("name", "Test Site");
		formData.set("slug", "test-site");
		formData.set("paths", "[]");

		const request = new Request("http://localhost/api/sites/deploy", {
			method: "POST",
			body: formData,
		});
		const ctx = createExecutionContext();
		const response = await app.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(400);
		const data = (await response.json()) as { error: string };
		expect(data.error).toContain("folder or ZIP");
	});

	it("returns 404 for non-existent site via API", async () => {
		const request = new Request(
			"http://localhost/api/sites/nonexistent-slug",
		);
		const ctx = createExecutionContext();
		const response = await app.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(404);
		const data = (await response.json()) as { error: string };
		expect(data.error).toBe("Site not found");
	});

	// ── Favicon ──────────────────────────────────────────────────────────

	it("returns 204 for favicon.ico", async () => {
		const request = new Request("http://localhost/favicon.ico");
		const ctx = createExecutionContext();
		const response = await app.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(204);
	});
});
