import {
	createExecutionContext,
	env,
	fetchMock,
	waitOnExecutionContext,
} from "cloudflare:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
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
	fetchMock.assertNoPendingInterceptors();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Internal Sites Platform", () => {
	// ── Localhost (local dev bypass) ─────────────────────────────────────

	it("serves the deploy page on localhost without JWT", async () => {
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

	it("distinguishes an invalid Access token from missing Access setup", async () => {
		mockJwksEndpoint();

		const token = await signTestJwt();
		const request = new Request(
			"https://my-worker.my-account.workers.dev/deploy",
			{ headers: { "Cf-Access-Jwt-Assertion": token } },
		);
		const ctx = createExecutionContext();
		const response = await app.fetch(
			request,
			envWithAccess({ ACCESS_AUD: "different-audience" }),
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

	it("serves the deploy page with a valid JWT on workers.dev", async () => {
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

	it("returns 404 for non-existent site via API", async () => {
		const request = new Request("http://localhost/api/sites/nonexistent-slug");
		const ctx = createExecutionContext();
		const response = await app.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(404);
		const data = (await response.json()) as { error: string };
		expect(data.error).toBe("Site not found");
	});

	// ── Site serving does not touch D1 or require JWT ────────────────────

	it("does not call D1 when loading a site file", async () => {
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

		const mockDispatcher = {
			get() {
				throw new Error("Worker not found");
			},
		};

		// Request a CSS file via path-based routing on localhost.
		// The wildcard handler dispatches without auth or D1.
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

		expect(response.status).toBe(404);
	});

	it("serves site files without JWT on workers.dev (auth at edge)", async () => {
		const mockDispatcher = {
			get() {
				throw new Error("Worker not found");
			},
		};

		// No JWT header, no ACCESS vars — site serving still works.
		const request = new Request(
			"https://my-worker.my-account.workers.dev/sites/test-site/index.html",
		);
		const workerEnv = {
			...env,
			dispatcher: mockDispatcher,
		};
		const ctx = createExecutionContext();
		const response = await app.fetch(request, workerEnv, ctx);
		await waitOnExecutionContext(ctx);

		// 404 from "Worker not found" — not 401. Proves no auth check ran.
		expect(response.status).toBe(404);
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

	it("dispatches subdomain requests to site Worker, not platform routes", async () => {
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
