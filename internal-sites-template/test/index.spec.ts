import {
	createExecutionContext,
	env,
	waitOnExecutionContext,
} from "cloudflare:test";
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { fetchMock } from "./fetch-mock";
import app, { resetDbInitialized } from "../src/index";

// ── Test helpers ─────────────────────────────────────────────────────────────

/**
 * Create an ExecutionContext with a mock ctx.access object.
 * This simulates what the Workers runtime provides when Cloudflare Access
 * has authenticated a request.
 */
function createAccessContext(
	identity: Record<string, unknown> = { email: "employee@company.com" },
) {
	const ctx = createExecutionContext();
	(ctx as Record<string, unknown>).access = {
		aud: "test-aud-tag-1234567890",
		getIdentity: async () => identity,
	};
	return ctx;
}

/**
 * Create an ExecutionContext without ctx.access.
 * This simulates a request that was NOT authenticated by Access.
 */
function createNoAccessContext() {
	return createExecutionContext();
}

const deploymentEnv = {
	...env,
	ACCOUNT_ID: "test-account",
	DISPATCH_NAMESPACE_NAME: "internal-sites",
	DISPATCH_NAMESPACE_API_TOKEN: "test-api-token",
};

function deploymentRequest(slug: string, name = "Test Site"): Request {
	const formData = new FormData();
	formData.set("name", name);
	formData.set("slug", slug);
	formData.set("paths", JSON.stringify(["index.html"]));
	formData.append(
		"files",
		new File(["<!doctype html><title>Test</title>"], "index.html", {
			type: "text/html",
		}),
	);

	return new Request("http://localhost/api/sites/deploy", {
		method: "POST",
		body: formData,
	});
}

function mockCloudflareDeploymentSuccess(slug: string): void {
	const scriptPath = `/client/v4/accounts/test-account/workers/dispatch/namespaces/internal-sites/scripts/${slug}`;

	fetchMock
		.get("https://api.cloudflare.com")
		.intercept({
			path: `${scriptPath}/assets-upload-session`,
			method: "POST",
		})
		.reply(
			200,
			JSON.stringify({
				success: true,
				result: { jwt: "test-upload-jwt", buckets: [] },
			}),
			{ headers: { "content-type": "application/json" } },
		);

	fetchMock
		.get("https://api.cloudflare.com")
		.intercept({ path: scriptPath, method: "PUT" })
		.reply(200, JSON.stringify({ success: true, result: {} }), {
			headers: { "content-type": "application/json" },
		});
}

function mockCloudflareDeploymentFailure(slug: string): void {
	fetchMock
		.get("https://api.cloudflare.com")
		.intercept({
			path: `/client/v4/accounts/test-account/workers/dispatch/namespaces/internal-sites/scripts/${slug}/assets-upload-session`,
			method: "POST",
		})
		.reply(
			500,
			JSON.stringify({
				success: false,
				result: null,
				errors: [{ message: "raw Cloudflare failure" }],
			}),
			{ headers: { "content-type": "application/json" } },
		);
}

// ── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
	fetchMock.activate();
	fetchMock.disableNetConnect();
});

beforeEach(() => {
	resetDbInitialized();
});

afterEach(() => {
	vi.restoreAllMocks();
	fetchMock.assertNoPendingInterceptors();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Internal Sites Platform", () => {
	// ── Authenticated access via ctx.access ──────────────────────────────

	it("serves the deploy page when ctx.access is present", async () => {
		const request = new Request("http://localhost/deploy");
		const ctx = createAccessContext();
		const response = await app.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		const body = await response.text();
		expect(body).toContain("Upload and deploy");
		expect(body).toContain("Deploy site");
		expect(body).toContain("Drop a folder. Or a zip.");
	});

	it("redirects / to /deploy", async () => {
		const request = new Request("http://localhost/");
		const ctx = createAccessContext();
		const response = await app.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe("/deploy");
	});

	it("returns 204 for favicon.ico", async () => {
		const request = new Request("http://localhost/favicon.ico");
		const ctx = createAccessContext();
		const response = await app.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(204);
	});

	// ── Unauthenticated: ctx.access is undefined ────────────────────────

	it("returns 401 when ctx.access is not present", async () => {
		const request = new Request(
			"https://my-worker.my-account.workers.dev/deploy",
		);
		const ctx = createNoAccessContext();
		const response = await app.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(401);
		const body = await response.text();
		expect(body).toContain("Setup required: Enable Cloudflare Access");
		expect(body).toContain("Protect this Worker behind Access");
	});

	it("returns 401 on custom domain without Access", async () => {
		const request = new Request("https://mycompany.com/deploy");
		const customEnv = {
			...env,
			SITE_DOMAIN: "mycompany.com",
		};
		const ctx = createNoAccessContext();
		const response = await app.fetch(request, customEnv, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(401);
		const body = await response.text();
		expect(body).toContain("Setup required: Enable Cloudflare Access");
	});

	it("returns 401 on custom domain API route without Access", async () => {
		const request = new Request("https://mycompany.com/api/sites/test");
		const customEnv = {
			...env,
			SITE_DOMAIN: "mycompany.com",
		};
		const ctx = createNoAccessContext();
		const response = await app.fetch(request, customEnv, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(401);
	});

	// ── Authenticated on workers.dev and custom domains ──────────────────

	it("serves the deploy page with ctx.access on workers.dev", async () => {
		const request = new Request(
			"https://my-worker.my-account.workers.dev/deploy",
		);
		const ctx = createAccessContext();
		const response = await app.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		const body = await response.text();
		expect(body).toContain("Upload and deploy");
	});

	it("serves the deploy page with ctx.access on custom domain", async () => {
		const request = new Request("https://mycompany.com/deploy");
		const customEnv = { ...env, SITE_DOMAIN: "mycompany.com" };
		const ctx = createAccessContext();
		const response = await app.fetch(request, customEnv, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		const body = await response.text();
		expect(body).toContain("Upload and deploy");
	});

	// ── Site dispatch requires Access ────────────────────────────────────

	it("rejects a site request before dispatching when ctx.access is missing", async () => {
		let dispatchCalls = 0;
		const mockDispatcher = {
			get() {
				dispatchCalls += 1;
				throw new Error("Site request must be authenticated first");
			},
		};

		const request = new Request(
			"https://my-worker.my-account.workers.dev/sites/test-site",
		);
		const workerEnv = { ...env, dispatcher: mockDispatcher };
		const ctx = createNoAccessContext();
		const response = await app.fetch(request, workerEnv, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(401);
		expect(await response.text()).toContain(
			"Setup required: Enable Cloudflare Access",
		);
		expect(dispatchCalls).toBe(0);
	});

	it("rejects a custom-subdomain site request before dispatching when ctx.access is missing", async () => {
		let dispatchCalls = 0;
		const mockDispatcher = {
			get() {
				dispatchCalls += 1;
				throw new Error("Site request must be authenticated first");
			},
		};

		const request = new Request("https://docs.mycompany.com/index.html");
		const customEnv = {
			...env,
			SITE_DOMAIN: "mycompany.com",
			dispatcher: mockDispatcher,
		};
		const ctx = createNoAccessContext();
		const response = await app.fetch(request, customEnv, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(401);
		expect(await response.text()).toContain(
			"Setup required: Enable Cloudflare Access",
		);
		expect(dispatchCalls).toBe(0);
	});

	// ── API validation (with ctx.access) ────────────────────────────────

	it("returns 400 when deploying with no files", async () => {
		const formData = new FormData();
		formData.set("name", "Test Site");
		formData.set("slug", "test-site");
		formData.set("paths", "[]");

		const request = new Request("http://localhost/api/sites/deploy", {
			method: "POST",
			body: formData,
		});
		const ctx = createAccessContext();
		const response = await app.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(400);
		const data = (await response.json()) as { error: string };
		expect(data.error).toContain("folder or ZIP");
	});

	it("returns 502 and removes a new site when Cloudflare deployment fails", async () => {
		const slug = "new-cloudflare-failure";
		mockCloudflareDeploymentFailure(slug);

		const ctx = createAccessContext();
		const response = await app.fetch(
			deploymentRequest(slug),
			deploymentEnv,
			ctx,
		);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(502);
		const data = (await response.json()) as { error: string };
		expect(data.error).not.toContain("raw Cloudflare failure");
		expect(data.error).not.toContain("test-api-token");

		const lookupCtx = createAccessContext();
		const lookup = await app.fetch(
			new Request(`http://localhost/api/sites/${slug}`),
			deploymentEnv,
			lookupCtx,
		);
		await waitOnExecutionContext(lookupCtx);

		expect(lookup.status).toBe(404);
	});

	it("logs deployment and cleanup errors without exposing them to the user", async () => {
		const slug = "cleanup-failure";
		const baseDb = deploymentEnv.DB;
		const cleanupError = new Error("private cleanup failure details");
		const cleanupFailingDb = {
			prepare(query: string) {
				if (query === "DELETE FROM sites WHERE id = ?") {
					return {
						bind() {
							return {
								run: async () => {
									throw cleanupError;
								},
							};
						},
					};
				}

				return baseDb.prepare(query);
			},
			batch(statements: D1PreparedStatement[]) {
				return baseDb.batch(statements);
			},
		} as D1Database;
		const cleanupFailingEnv = { ...deploymentEnv, DB: cleanupFailingDb };
		const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
		mockCloudflareDeploymentFailure(slug);

		const ctx = createAccessContext();
		const response = await app.fetch(
			deploymentRequest(slug),
			cleanupFailingEnv,
			ctx,
		);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(502);
		expect(errorLog).toHaveBeenCalledTimes(2);
		expect(errorLog.mock.calls[0][0]).toBe("Cloudflare deployment failed");
		expect(errorLog.mock.calls[1]).toEqual([
			"Provisional site cleanup failed after Cloudflare deployment failure",
			{
				deploymentError: expect.any(Error),
				cleanupError,
			},
		]);

		const data = (await response.json()) as { error: string };
		expect(data.error).not.toContain("raw Cloudflare failure");
		expect(data.error).not.toContain("private cleanup failure details");
	});

	it("returns 502 and leaves an existing site unchanged when redeployment fails", async () => {
		const slug = "existing-cloudflare-failure";
		mockCloudflareDeploymentSuccess(slug);

		const createCtx = createAccessContext();
		const createResponse = await app.fetch(
			deploymentRequest(slug, "Original Site"),
			deploymentEnv,
			createCtx,
		);
		await waitOnExecutionContext(createCtx);
		expect(createResponse.status).toBe(201);

		const beforeCtx = createAccessContext();
		const beforeResponse = await app.fetch(
			new Request(`http://localhost/api/sites/${slug}`),
			deploymentEnv,
			beforeCtx,
		);
		await waitOnExecutionContext(beforeCtx);
		const originalSite = await beforeResponse.json();

		mockCloudflareDeploymentFailure(slug);
		const redeployCtx = createAccessContext();
		const redeployResponse = await app.fetch(
			deploymentRequest(slug, "Attempted Rename"),
			deploymentEnv,
			redeployCtx,
		);
		await waitOnExecutionContext(redeployCtx);
		expect(redeployResponse.status).toBe(502);

		const afterCtx = createAccessContext();
		const afterResponse = await app.fetch(
			new Request(`http://localhost/api/sites/${slug}`),
			deploymentEnv,
			afterCtx,
		);
		await waitOnExecutionContext(afterCtx);

		expect(afterResponse.status).toBe(200);
		expect(await afterResponse.json()).toEqual(originalSite);
	});

	it("returns 500 for an unexpected D1 failure", async () => {
		const failingDb = new Proxy(
			{},
			{
				get() {
					throw new Error("private D1 failure details");
				},
			},
		) as D1Database;
		const failingEnv = { ...deploymentEnv, DB: failingDb };

		const ctx = createAccessContext();
		const response = await app.fetch(
			deploymentRequest("d1-failure"),
			failingEnv,
			ctx,
		);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(500);
		const data = (await response.json()) as { error: string };
		expect(data.error).toContain("internal error");
		expect(data.error).not.toContain("private D1 failure details");
	});

	it("returns 404 for non-existent site via API", async () => {
		const request = new Request("http://localhost/api/sites/nonexistent-slug");
		const ctx = createAccessContext();
		const response = await app.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(404);
		const data = (await response.json()) as { error: string };
		expect(data.error).toBe("Site not found");
	});

	// ── Authenticated site serving without D1 ────────────────────────────

	it("serves a site with ctx.access without D1 access", async () => {
		const throwingDb = new Proxy(
			{},
			{
				get(_target, prop) {
					throw new Error(
						`D1 should not be called when serving site files, but "${String(prop)}" was accessed`,
					);
				},
			},
		);

		let dispatchedSlug: string | null = null;
		const mockDispatcher = {
			get(slug: string) {
				dispatchedSlug = slug;
				return {
					fetch: async () => new Response("body { color: green; }"),
				};
			},
		};

		const request = new Request(
			"http://localhost/sites/my-test-site/style.css",
		);
		const noDbEnv = {
			...env,
			DB: throwingDb as D1Database,
			dispatcher: mockDispatcher,
		};
		const ctx = createAccessContext();
		const response = await app.fetch(request, noDbEnv, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("body { color: green; }");
		expect(dispatchedSlug).toBe("my-test-site");
	});

	it("dispatches an authenticated workers.dev site request without accessing D1", async () => {
		const throwingDb = new Proxy(
			{},
			{
				get(_target, prop) {
					throw new Error(
						`D1 should not be called when serving site files, but "${String(prop)}" was accessed`,
					);
				},
			},
		);
		let dispatchedPath: string | null = null;
		const mockDispatcher = {
			get(slug: string) {
				expect(slug).toBe("test-site");
				return {
					fetch: async (siteRequest: Request) => {
						dispatchedPath = new URL(siteRequest.url).pathname;
						return new Response("authenticated site content");
					},
				};
			},
		};
		const request = new Request(
			"https://my-worker.my-account.workers.dev/sites/test-site/style.css",
		);
		const workerEnv = {
			...env,
			DB: throwingDb as D1Database,
			dispatcher: mockDispatcher,
		};
		const ctx = createAccessContext();
		const response = await app.fetch(request, workerEnv, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("authenticated site content");
		expect(dispatchedPath).toBe("/style.css");
	});

	it("sandboxes path-based HTML without preserving its origin", async () => {
		const mockDispatcher = {
			get() {
				return {
					fetch: async () =>
						new Response(
							"<html><script>document.body.textContent = 'ok'</script></html>",
							{
								headers: { "content-type": "text/html" },
							},
						),
				};
			},
		};
		const request = new Request(
			"https://my-worker.my-account.workers.dev/sites/test-site/",
		);
		const workerEnv = { ...env, dispatcher: mockDispatcher };
		const ctx = createAccessContext();
		const response = await app.fetch(request, workerEnv, ctx);
		await waitOnExecutionContext(ctx);

		const csp = response.headers.get("content-security-policy");
		expect(csp).toContain("sandbox");
		expect(csp).toContain("allow-scripts");
		expect(csp).not.toContain("allow-same-origin");
	});

	// ── Origin protection ───────────────────────────────────────────────

	it("rejects a POST with an opaque browser origin and no Referer", async () => {
		const request = new Request("http://localhost/api/sites/deploy", {
			method: "POST",
			headers: { Origin: "null" },
		});
		const ctx = createAccessContext();
		const response = await app.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(request.headers.has("Referer")).toBe(false);
		expect(response.status).toBe(403);
	});

	it("rejects a POST from another website", async () => {
		const request = new Request("http://localhost/api/sites/deploy", {
			method: "POST",
			headers: { Origin: "https://example.com" },
		});
		const ctx = createAccessContext();
		const response = await app.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(403);
	});

	it("allows a same-origin POST from the deploy page", async () => {
		const formData = new FormData();
		formData.set("name", "Test Site");
		formData.set("slug", "test-site");
		formData.set("paths", "[]");

		const request = new Request("http://localhost/api/sites/deploy", {
			method: "POST",
			body: formData,
			headers: {
				Origin: "http://localhost",
				Referer: "http://localhost/deploy",
			},
		});
		const ctx = createAccessContext();
		const response = await app.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		// The handler returns 400 because there are no files.
		expect(response.status).toBe(400);
	});

	it("allows a POST without Origin for non-browser clients", async () => {
		const formData = new FormData();
		formData.set("name", "Test Site");
		formData.set("slug", "test-site");
		formData.set("paths", "[]");

		const request = new Request("http://localhost/api/sites/deploy", {
			method: "POST",
			body: formData,
		});
		const ctx = createAccessContext();
		const response = await app.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(request.headers.has("Origin")).toBe(false);
		expect(response.status).toBe(400);
	});

	// ── HTML safety ─────────────────────────────────────────────────────

	it("escapes </script> sequences in siteDomain config", async () => {
		const request = new Request("http://localhost/deploy");
		const maliciousEnv = {
			...env,
			SITE_DOMAIN: "</script><script>alert(1)</script>",
		};
		const ctx = createAccessContext();
		const response = await app.fetch(request, maliciousEnv, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		const body = await response.text();
		// The </script> sequence must not appear unescaped in the inline script
		expect(body).not.toContain("</script><script>alert(1)</script>");
		// The value should be safely serialized with \u003c
		expect(body).toContain("\\u003c/script>");
	});

	// ── Subdomain isolation ──────────────────────────────────────────────

	it("dispatches authenticated subdomain requests to the site Worker, not platform routes", async () => {
		let dispatchedSlug: string | null = null;
		const mockDispatcher = {
			get(slug: string) {
				dispatchedSlug = slug;
				return {
					fetch: async () =>
						new Response("<html>site content</html>", {
							headers: { "content-type": "text/html" },
						}),
				};
			},
		};

		// Request docs.mycompany.com/deploy — should dispatch to the "docs" site
		// Worker, NOT serve the deploy page.
		const request = new Request("https://docs.mycompany.com/deploy");
		const customEnv = {
			...env,
			SITE_DOMAIN: "mycompany.com",
			dispatcher: mockDispatcher,
		};
		const ctx = createAccessContext();
		const response = await app.fetch(request, customEnv, ctx);
		await waitOnExecutionContext(ctx);

		expect(dispatchedSlug).toBe("docs");
		expect(response.status).toBe(200);
		expect(response.headers.get("content-security-policy")).toBeNull();
		const body = await response.text();
		// Should be the site content, NOT the deploy page
		expect(body).toContain("site content");
		expect(body).not.toContain("Upload and deploy");
	});
});
