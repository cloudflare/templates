import {
	createExecutionContext,
	env,
	fetchMock,
	waitOnExecutionContext,
} from "cloudflare:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { resetJwksCache } from "../src/access";
import app, { resetDbInitialized } from "../src/index";

// ── Test JWT helpers ─────────────────────────────────────────────────────────

const TEST_TEAM_DOMAIN = "https://test-team.cloudflareaccess.com";
const TEST_AUD = "test-aud-tag-1234567890";

/** Shared key pair generated once before all tests. */
let testPublicJwk: Record<string, unknown>;
let testPrivateKey: CryptoKey;

/** Sign a test JWT with the given claims. */
async function signTestJwt(
	overrides: Record<string, unknown> = {},
): Promise<string> {
	return new SignJWT({
		email: "employee@company.com",
		type: "app",
		...overrides,
	})
		.setProtectedHeader({ alg: "RS256", kid: "test-key-id" })
		.setIssuer(TEST_TEAM_DOMAIN)
		.setAudience(TEST_AUD)
		.setExpirationTime("1h")
		.setIssuedAt()
		.setSubject("test-user-id")
		.sign(testPrivateKey);
}

/** Build an env with Access JWT verification configured. */
function envWithAccess(extra: Record<string, unknown> = {}) {
	return {
		...env,
		ACCESS_TEAM_DOMAIN: TEST_TEAM_DOMAIN,
		ACCESS_AUD: TEST_AUD,
		...extra,
	};
}

/** Set up fetchMock to return our test public key at the JWKS endpoint. */
function mockJwksEndpoint() {
	fetchMock
		.get(TEST_TEAM_DOMAIN)
		.intercept({ path: "/cdn-cgi/access/certs", method: "GET" })
		.reply(
			200,
			JSON.stringify({
				keys: [testPublicJwk],
				public_certs: [],
			}),
			{ headers: { "content-type": "application/json" } },
		);
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
	// Generate a key pair for signing test JWTs.
	const pair = await generateKeyPair("RS256");
	testPrivateKey = pair.privateKey as unknown as CryptoKey;
	const jwk = await exportJWK(pair.publicKey);
	testPublicJwk = { ...jwk, kid: "test-key-id", alg: "RS256", use: "sig" };

	// Enable fetchMock for all tests (intercepts outbound fetch).
	fetchMock.activate();
	fetchMock.disableNetConnect();
});

beforeEach(() => {
	resetDbInitialized();
	resetJwksCache();
});

afterEach(() => {
	vi.restoreAllMocks();
	fetchMock.assertNoPendingInterceptors();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Internal Sites Platform", () => {
	// ── Localhost (local dev bypass) ─────────────────────────────────────

	it("serves the deploy page on localhost without ACCESS_AUD or JWT", async () => {
		const request = new Request("http://localhost/deploy");
		const ctx = createExecutionContext();
		const response = await app.fetch(
			request,
			{ ...env, ACCESS_AUD: undefined },
			ctx,
		);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		const body = await response.text();
		expect(body).toContain("Upload and deploy");
		expect(body).toContain("Deploy site");
		expect(body).toContain("Drop a folder. Or a zip.");
	});

	it("redirects / to /deploy", async () => {
		const request = new Request("http://localhost/");
		const ctx = createExecutionContext();
		const response = await app.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe("/deploy");
	});

	it("returns 204 for favicon.ico", async () => {
		const request = new Request("http://localhost/favicon.ico");
		const ctx = createExecutionContext();
		const response = await app.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(204);
	});

	// ── Workers.dev no longer gets a free pass ──────────────────────────

	it("returns 401 on workers.dev without ACCESS vars configured", async () => {
		const request = new Request(
			"https://my-worker.my-account.workers.dev/deploy",
		);
		const ctx = createExecutionContext();
		const response = await app.fetch(
			request,
			{ ...env, ACCESS_TEAM_DOMAIN: undefined, ACCESS_AUD: undefined },
			ctx,
		);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(401);
		const body = await response.text();
		expect(body).toContain("Access verification is not configured");
	});

	it("returns setup guidance when ACCESS_TEAM_DOMAIN is set without ACCESS_AUD", async () => {
		const token = await signTestJwt();
		const request = new Request(
			"https://my-worker.my-account.workers.dev/deploy",
			{ headers: { "Cf-Access-Jwt-Assertion": token } },
		);
		const ctx = createExecutionContext();
		const response = await app.fetch(
			request,
			envWithAccess({ ACCESS_AUD: undefined }),
			ctx,
		);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(401);
		const body = await response.text();
		expect(body).toContain(
			"Cloudflare Access setup is incomplete: ACCESS_AUD is missing",
		);
		expect(body).toContain("Application Audience (AUD) Tag");
		expect(body).toContain("npm exec -- wrangler secret put ACCESS_AUD");
		expect(body).toContain(
			"Workers & Pages > this Worker > Settings > Variables and Secrets",
		);
		expect(body).not.toContain("Setup required: Enable Cloudflare Access");
	});

	it("returns 401 on workers.dev with ACCESS vars but no JWT", async () => {
		const request = new Request(
			"https://my-worker.my-account.workers.dev/deploy",
		);
		const ctx = createExecutionContext();
		const response = await app.fetch(request, envWithAccess(), ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(401);
		const body = await response.text();
		expect(body).toContain("Setup required: Enable Cloudflare Access");
		expect(body).toContain(
			"https://dash.cloudflare.com/?to=/:account/workers-and-pages",
		);
		expect(body).toContain("Protect this Worker behind Access");
		expect(body).not.toContain("Missing Cf-Access-Jwt-Assertion header");
	});

	it("rejects a site request with a JWT issued for the wrong audience", async () => {
		mockJwksEndpoint();

		let dispatchCalls = 0;
		const mockDispatcher = {
			get() {
				dispatchCalls += 1;
				throw new Error("Site request must be authenticated first");
			},
		};
		const token = await signTestJwt();
		const request = new Request(
			"https://my-worker.my-account.workers.dev/sites/test-site/index.html",
			{ headers: { "Cf-Access-Jwt-Assertion": token } },
		);
		const ctx = createExecutionContext();
		const response = await app.fetch(
			request,
			envWithAccess({
				ACCESS_AUD: "different-audience",
				dispatcher: mockDispatcher,
			}),
			ctx,
		);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(401);
		const body = await response.text();
		expect(body).toContain(
			"Your Cloudflare Access token could not be verified",
		);
		expect(body).toContain("confirm ACCESS_TEAM_DOMAIN and ACCESS_AUD");
		expect(body).not.toContain("Setup required: Enable Cloudflare Access");
		expect(dispatchCalls).toBe(0);
	});

	// ── Custom domain without Access ────────────────────────────────────

	it("returns 401 on custom domain without ACCESS vars configured", async () => {
		const request = new Request("https://mycompany.com/deploy");
		const customEnv = {
			...env,
			SITE_DOMAIN: "mycompany.com",
			ACCESS_TEAM_DOMAIN: undefined,
			ACCESS_AUD: undefined,
		};
		const ctx = createExecutionContext();
		const response = await app.fetch(request, customEnv, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(401);
		const body = await response.text();
		expect(body).toContain("Access verification is not configured");
	});

	it("returns 401 on custom domain API route without JWT", async () => {
		const request = new Request("https://mycompany.com/api/sites/test");
		const customEnv = {
			...env,
			SITE_DOMAIN: "mycompany.com",
			ACCESS_TEAM_DOMAIN: TEST_TEAM_DOMAIN,
			ACCESS_AUD: TEST_AUD,
		};
		const ctx = createExecutionContext();
		const response = await app.fetch(request, customEnv, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(401);
	});

	// ── Trusted email header alone is no longer sufficient ──────────────

	it("rejects requests with only the email header (no JWT)", async () => {
		const request = new Request("https://mycompany.com/deploy", {
			headers: {
				"Cf-Access-Authenticated-User-Email": "test@company.com",
			},
		});
		const customEnv = {
			...env,
			SITE_DOMAIN: "mycompany.com",
			ACCESS_TEAM_DOMAIN: TEST_TEAM_DOMAIN,
			ACCESS_AUD: TEST_AUD,
		};
		const ctx = createExecutionContext();
		const response = await app.fetch(request, customEnv, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(401);
		const body = await response.text();
		expect(body).toContain("Setup required: Enable Cloudflare Access");
	});

	// ── Valid JWT accepted ───────────────────────────────────────────────

	it("accepts a valid Access JWT issued for the configured audience", async () => {
		mockJwksEndpoint();

		const token = await signTestJwt();
		const request = new Request(
			"https://my-worker.my-account.workers.dev/deploy",
			{ headers: { "Cf-Access-Jwt-Assertion": token } },
		);
		const ctx = createExecutionContext();
		const response = await app.fetch(request, envWithAccess(), ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		const body = await response.text();
		expect(body).toContain("Upload and deploy");
	});

	it("serves the deploy page with a valid JWT on custom domain", async () => {
		mockJwksEndpoint();

		const token = await signTestJwt();
		const request = new Request("https://mycompany.com/deploy", {
			headers: { "Cf-Access-Jwt-Assertion": token },
		});
		const customEnv = envWithAccess({ SITE_DOMAIN: "mycompany.com" });
		const ctx = createExecutionContext();
		const response = await app.fetch(request, customEnv, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		const body = await response.text();
		expect(body).toContain("Upload and deploy");
	});

	// ── API validation (localhost, auth bypassed) ────────────────────────

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

	it("returns 502 and removes a new site when Cloudflare deployment fails", async () => {
		const slug = "new-cloudflare-failure";
		mockCloudflareDeploymentFailure(slug);

		const ctx = createExecutionContext();
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

		const lookupCtx = createExecutionContext();
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

		const ctx = createExecutionContext();
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

		const createCtx = createExecutionContext();
		const createResponse = await app.fetch(
			deploymentRequest(slug, "Original Site"),
			deploymentEnv,
			createCtx,
		);
		await waitOnExecutionContext(createCtx);
		expect(createResponse.status).toBe(201);

		const beforeCtx = createExecutionContext();
		const beforeResponse = await app.fetch(
			new Request(`http://localhost/api/sites/${slug}`),
			deploymentEnv,
			beforeCtx,
		);
		await waitOnExecutionContext(beforeCtx);
		const originalSite = await beforeResponse.json();

		mockCloudflareDeploymentFailure(slug);
		const redeployCtx = createExecutionContext();
		const redeployResponse = await app.fetch(
			deploymentRequest(slug, "Attempted Rename"),
			deploymentEnv,
			redeployCtx,
		);
		await waitOnExecutionContext(redeployCtx);
		expect(redeployResponse.status).toBe(502);

		const afterCtx = createExecutionContext();
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

		const ctx = createExecutionContext();
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
		const ctx = createExecutionContext();
		const response = await app.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(404);
		const data = (await response.json()) as { error: string };
		expect(data.error).toBe("Site not found");
	});

	// ── Authenticated site serving without D1 ────────────────────────────

	it("serves a localhost site without a JWT or D1 access", async () => {
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
		const ctx = createExecutionContext();
		const response = await app.fetch(request, noDbEnv, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("body { color: green; }");
		expect(dispatchedSlug).toBe("my-test-site");
	});

	it("rejects a workers.dev site request before redirecting or dispatching when JWT is missing", async () => {
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
		const workerEnv = envWithAccess({ dispatcher: mockDispatcher });
		const ctx = createExecutionContext();
		const response = await app.fetch(request, workerEnv, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(401);
		expect(await response.text()).toContain(
			"Setup required: Enable Cloudflare Access",
		);
		expect(dispatchCalls).toBe(0);
	});

	it("rejects a custom-subdomain site request before dispatching when JWT is missing", async () => {
		let dispatchCalls = 0;
		const mockDispatcher = {
			get() {
				dispatchCalls += 1;
				throw new Error("Site request must be authenticated first");
			},
		};

		const request = new Request("https://docs.mycompany.com/index.html");
		const customEnv = envWithAccess({
			SITE_DOMAIN: "mycompany.com",
			dispatcher: mockDispatcher,
		});
		const ctx = createExecutionContext();
		const response = await app.fetch(request, customEnv, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(401);
		expect(await response.text()).toContain(
			"Setup required: Enable Cloudflare Access",
		);
		expect(dispatchCalls).toBe(0);
	});

	it("dispatches an authenticated workers.dev site request without accessing D1", async () => {
		mockJwksEndpoint();

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
		const token = await signTestJwt();
		const request = new Request(
			"https://my-worker.my-account.workers.dev/sites/test-site/style.css",
			{ headers: { "Cf-Access-Jwt-Assertion": token } },
		);
		const workerEnv = envWithAccess({
			DB: throwingDb as D1Database,
			dispatcher: mockDispatcher,
		});
		const ctx = createExecutionContext();
		const response = await app.fetch(request, workerEnv, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe("authenticated site content");
		expect(dispatchedPath).toBe("/style.css");
	});

	it("sandboxes path-based HTML without preserving its origin", async () => {
		mockJwksEndpoint();

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
		const token = await signTestJwt();
		const request = new Request(
			"https://my-worker.my-account.workers.dev/sites/test-site/",
			{ headers: { "Cf-Access-Jwt-Assertion": token } },
		);
		const workerEnv = envWithAccess({ dispatcher: mockDispatcher });
		const ctx = createExecutionContext();
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
		const ctx = createExecutionContext();
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
		const ctx = createExecutionContext();
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
		const ctx = createExecutionContext();
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
		const ctx = createExecutionContext();
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
		const ctx = createExecutionContext();
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
		mockJwksEndpoint();

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
		const token = await signTestJwt();
		const request = new Request("https://docs.mycompany.com/deploy", {
			headers: { "Cf-Access-Jwt-Assertion": token },
		});
		const customEnv = envWithAccess({
			SITE_DOMAIN: "mycompany.com",
			dispatcher: mockDispatcher,
		});
		const ctx = createExecutionContext();
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
