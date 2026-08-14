/**
 * Internal Sites Platform -- main entry point.
 *
 * A Hono application that serves the deploy UI, deploy API,
 * and dispatches requests to user-deployed static sites
 * via Workers for Platforms.
 *
 * Routing mode is auto-detected:
 *   - workers.dev / localhost: path-based routing (/sites/slug/)
 *   - Custom domain: subdomain routing (slug.company.com)
 */

import type { Context } from "hono";
import { Hono } from "hono";

import { isTestingMode, requireAccessIdentity } from "./access";
import { normalizeSlug, parseStaticSiteUpload } from "./assets";
import {
	CreateDeployment,
	CreateSite,
	DeleteSite,
	FetchDeploymentsWithSites,
	FetchTable,
	GetSiteBySlug,
	HasSitesTable,
	Initialize,
	UpdateSite,
} from "./db";
import type { Env } from "./env";
import { escapeHtml } from "./html";
import { BuildDeploymentsTable, BuildSitesTable, BuildTable } from "./render";
import {
	DeleteScriptInDispatchNamespace,
	GetScriptsInDispatchNamespace,
	PutStaticSiteInDispatchNamespace,
} from "./resource";
import type { Deployment, Site } from "./types";
import { renderDeployPage, renderNotFound, renderShell } from "./ui";

// ── App ──────────────────────────────────────────────────────────────────────

const app = new Hono<{ Bindings: Env }>();

// ── Database lazy-init ───────────────────────────────────────────────────────

/**
 * Module-level flag so we only check the schema once per isolate lifetime.
 * D1 is NOT touched on the site-serving path (wildcard handler) — only on
 * admin and deploy routes that actually need it.
 */
let dbInitialized = false;

async function ensureDb(db: D1Database): Promise<void> {
	if (dbInitialized) return;
	if (!(await HasSitesTable(db))) {
		await Initialize(db);
	}
	dbInitialized = true;
}

// ── Subdomain isolation ──────────────────────────────────────────────────────

/**
 * Intercept requests on site subdomains (slug.company.com), verify their
 * Access identity, and dispatch them directly to the site Worker. This runs
 * before any platform routes so uploaded site JS can never reach /deploy,
 * /admin, or /api/*.
 */
app.use("*", async (c, next) => {
	const url = new URL(c.req.url);
	const domain = siteDomain(c.env);

	if (url.hostname !== domain && url.hostname.endsWith(`.${domain}`)) {
		const slug = normalizeSlug(url.hostname.slice(0, -(domain.length + 1)));
		if (slug) {
			const identity = await requireAccessIdentity(c.req.raw, c.env);
			if (identity instanceof Response) return identity;

			return dispatchToSite(c, slug);
		}
	}

	return next();
});

// ── Routes ───────────────────────────────────────────────────────────────────

app.get("/favicon.ico", () => new Response(null, { status: 204 }));

app.get("/", (c) => c.redirect(deployPath(c.env)));

// Deploy page
app.get("/deploy", async (c) => {
	const identity = await requireAccessIdentity(c.req.raw, c.env);
	if (identity instanceof Response) return identity;

	return c.html(
		renderDeployPage({
			siteDomain: siteDomain(c.env),
			deployPath: deployPath(c.env),
		}),
	);
});

// ── Admin dashboard ──────────────────────────────────────────────────────────

app.get("/admin", async (c) => {
	const identity = await requireAccessIdentity(c.req.raw, c.env);
	if (identity instanceof Response) return identity;

	await ensureDb(c.env.DB);

	const urlFn = (slug: string) => siteUrl(c.req.raw, c.env, slug);

	let sitesHtml = "";
	let deploymentsHtml = "";
	let dispatchHtml = "";

	try {
		const sites = (await FetchTable(
			c.env.DB,
			"sites",
		)) as unknown as Parameters<typeof BuildSitesTable>[0];
		sitesHtml = BuildSitesTable(sites, urlFn);
	} catch (error) {
		sitesHtml = `<p class="admin-error">Could not load sites: ${escapeHtml(errorMessage(error))}</p>`;
	}

	try {
		const deployments = await FetchDeploymentsWithSites(c.env.DB);
		deploymentsHtml = BuildDeploymentsTable(deployments, urlFn);
	} catch (error) {
		deploymentsHtml = `<p class="admin-error">Could not load deployments: ${escapeHtml(errorMessage(error))}</p>`;
	}

	try {
		const scripts = await GetScriptsInDispatchNamespace(c.env);
		dispatchHtml = BuildTable(c.env.DISPATCH_NAMESPACE_NAME, scripts, [
			"id",
			"created_on",
			"modified_on",
		]);
	} catch (error) {
		dispatchHtml = `<p class="admin-error">Could not load dispatch namespace: ${escapeHtml(errorMessage(error))}</p>`;
	}

	const body = `
		<p class="admin-signed-in">Signed in as ${escapeHtml(identity.email)}</p>

		<div class="admin-section">
			<p class="admin-section-label">Sites</p>
			${sitesHtml}
		</div>

		<div class="admin-section">
			<p class="admin-section-label">Deployments</p>
			${deploymentsHtml}
		</div>

		<div class="admin-section">
			<p class="admin-section-label">Dispatch namespace &mdash; ${escapeHtml(c.env.DISPATCH_NAMESPACE_NAME ?? "internal-sites")}</p>
			${dispatchHtml}
		</div>
	`;

	return c.html(
		renderShell(body, {
			title: "Admin — Internal Sites",
			eyebrow: "Admin",
			heading: "Internal Sites",
			siteDomain: siteDomain(c.env),
			deployPath: deployPath(c.env),
		}),
	);
});

// ── Origin protection for mutating API routes ────────────────────────────────
//
// Sandboxed workers.dev previews have an opaque origin, so browser requests
// from them send `Origin: null`. Only the management origin may make browser
// mutations. Requests without Origin remain available to curl and other
// non-browser clients.

app.use("/api/*", async (c, next) => {
	if (c.req.method !== "POST" && c.req.method !== "DELETE") {
		return next();
	}

	const origin = c.req.header("Origin");
	if (origin !== undefined && origin !== new URL(c.req.url).origin) {
		return c.json(
			{ error: "Requests from other origins are not allowed" },
			403,
		);
	}

	return next();
});

// ── Deploy API ───────────────────────────────────────────────────────────────

app.post("/api/sites/deploy", async (c) => {
	const identity = await requireAccessIdentity(c.req.raw, c.env);
	if (identity instanceof Response) return identity;

	await ensureDb(c.env.DB);

	try {
		const upload = await parseStaticSiteUpload(c.req.raw);
		const existingSite = await GetSiteBySlug(c.env.DB, upload.slug);
		const now = new Date().toISOString();
		const site =
			existingSite || buildSite(upload.name, upload.slug, identity.email, now);

		// Prevent slug takeover
		if (existingSite && existingSite.owner_email !== identity.email) {
			return c.json(
				{
					error:
						"This site name is already taken. Please choose a different one.",
				},
				409,
			);
		}

		if (!existingSite) {
			await CreateSite(c.env.DB, site);
		}

		const deploy = await PutStaticSiteInDispatchNamespace(
			c.env,
			upload.slug,
			upload.assets,
		);

		const deployment: Deployment = {
			id: deploy.deploymentId,
			site_id: site.id,
			status: "success",
			file_count: deploy.fileCount,
			total_bytes: deploy.totalBytes,
			manifest_json: JSON.stringify(deploy.manifest),
			created_at: now,
			created_by_email: identity.email,
		};

		await CreateDeployment(c.env.DB, deployment);
		await UpdateSite(c.env.DB, site.id, {
			latest_deployment_id: deployment.id,
			updated_at: now,
		});

		return c.json(
			{
				slug: upload.slug,
				url: siteUrl(c.req.raw, c.env, upload.slug),
				fileCount: deploy.fileCount,
				totalBytes: deploy.totalBytes,
				protectedByAccess: !isTestingMode(c.req.raw, c.env),
			},
			201,
		);
	} catch (error) {
		console.error("Deploy failed", error);
		return c.json({ error: errorMessage(error) }, 400);
	}
});

// ── Site info ────────────────────────────────────────────────────────────────

app.get("/api/sites/:slug", async (c) => {
	const identity = await requireAccessIdentity(c.req.raw, c.env);
	if (identity instanceof Response) return identity;

	await ensureDb(c.env.DB);

	const slug = normalizeSlug(c.req.param("slug"));
	const site = await GetSiteBySlug(c.env.DB, slug);

	if (!site) {
		return c.json({ error: "Site not found" }, 404);
	}

	return c.json({
		...site,
		url: siteUrl(c.req.raw, c.env, site.slug),
	});
});

// ── Delete site ──────────────────────────────────────────────────────────────

app.delete("/api/sites/:slug", async (c) => {
	const identity = await requireAccessIdentity(c.req.raw, c.env);
	if (identity instanceof Response) return identity;

	await ensureDb(c.env.DB);

	const slug = normalizeSlug(c.req.param("slug"));
	const site = await GetSiteBySlug(c.env.DB, slug);

	if (!site) {
		return c.json({ error: "Site not found" }, 404);
	}

	if (site.owner_email !== identity.email) {
		return c.json({ error: "Only the owner can delete this site" }, 403);
	}

	// Delete the Worker from Cloudflare first. Only remove the D1 record
	// after Cloudflare confirms the deletion succeeded.
	try {
		await DeleteScriptInDispatchNamespace(c.env, slug);
	} catch (error) {
		console.error("Delete from Cloudflare failed", error);
		return c.json(
			{
				error: `Could not delete site from Cloudflare: ${errorMessage(error)}`,
			},
			502,
		);
	}

	await DeleteSite(c.env.DB, site.id);

	return c.json({ deleted: true });
});

// ── Wildcard: authenticate and dispatch to user site ─────────────────────────

app.get("*", async (c) => {
	const slug = slugFromRequest(c.req.raw, c.env);

	if (!slug) {
		return c.redirect(deployPath(c.env));
	}

	// Authenticate site requests before redirects or dispatch namespace access.
	const identity = await requireAccessIdentity(c.req.raw, c.env);
	if (identity instanceof Response) return identity;

	// Redirect /sites/slug to /sites/slug/ in path-based mode
	if (shouldRedirectPathBasedRoot(c.req.raw, c.env, slug)) {
		const url = new URL(c.req.url);
		url.pathname = `${url.pathname}/`;
		return c.redirect(url.toString(), 308);
	}

	return dispatchToSite(c, slug);
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Dispatch a request to a deployed site Worker by slug. */
async function dispatchToSite(
	c: Context<{ Bindings: Env }>,
	slug: string,
): Promise<Response> {
	try {
		const worker = c.env.dispatcher.get(slug);
		const response = await worker.fetch(requestForSite(c.req.raw, c.env, slug));
		return await responseForSite(c.req.raw, c.env, slug, response);
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.startsWith("Worker not found")
		) {
			return c.html(renderNotFound(siteDomain(c.env), deployPath(c.env)), 404);
		}

		console.error("Dispatch failed", error);
		return c.text("Could not load internal site", 500);
	}
}

function buildSite(
	name: string,
	slug: string,
	ownerEmail: string,
	now: string,
): Site {
	return {
		id: `site-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
		name,
		slug,
		owner_email: ownerEmail,
		visibility: "company",
		created_at: now,
		updated_at: now,
		latest_deployment_id: null,
	};
}

/**
 * Extract the site slug from the incoming request.
 *
 * Production (custom domain): reads from the subdomain
 *   e.g. "docs" from "docs.internal-company.com"
 *
 * Testing (workers.dev / localhost): reads from the path
 *   e.g. "docs" from "/sites/docs/index.html"
 */
function slugFromRequest(request: Request, env: Env): string | null {
	const url = new URL(request.url);
	const domain = siteDomain(env);

	// Production: subdomain routing
	if (url.hostname.endsWith(`.${domain}`)) {
		return normalizeSlug(url.hostname.slice(0, -(domain.length + 1)));
	}

	// Testing: path-based routing
	if (isTestingMode(request, env) && url.pathname.startsWith("/sites/")) {
		return normalizeSlug(url.pathname.split("/")[2] || "");
	}

	return null;
}

/** Generate the URL for a deployed site. */
function siteUrl(request: Request, env: Env, slug: string): string {
	if (isTestingMode(request, env)) {
		const url = new URL(request.url);
		return `${url.origin}/sites/${slug}/`;
	}

	return `https://${slug}.${siteDomain(env)}`;
}

/** Strip the /sites/slug prefix when dispatching in path-based mode. */
function requestForSite(request: Request, env: Env, slug: string): Request {
	if (!isTestingMode(request, env)) {
		return request;
	}

	const url = new URL(request.url);
	const prefix = `/sites/${slug}`;

	if (!url.pathname.startsWith(prefix)) {
		return request;
	}

	url.pathname = url.pathname.slice(prefix.length) || "/";
	return new Request(url.toString(), request);
}

/** Rewrite asset URLs in path-based mode so relative paths resolve correctly. */
async function responseForSite(
	request: Request,
	env: Env,
	slug: string,
	response: Response,
): Promise<Response> {
	if (!isTestingMode(request, env)) {
		return response;
	}

	// Decide whether this response is HTML that needs asset-URL rewriting.
	// Prefer the content-type header, but fall back to the request path since
	// the dispatched static-asset Worker may omit or vary the header. Requests
	// ending in "/" resolve to index.html via auto-trailing-slash handling.
	const contentType = response.headers.get("content-type") || "";
	const pathname = new URL(request.url).pathname;
	const looksLikeHtml =
		contentType.includes("text/html") ||
		pathname.endsWith("/") ||
		pathname.endsWith(".html") ||
		pathname.endsWith(".htm");

	if (!looksLikeHtml) {
		return response;
	}

	const html = await response.text();
	const rewrittenHtml = rewritePathBasedAssetUrls(html, slug);
	const headers = new Headers(response.headers);
	headers.delete("content-length");

	// Rebuilding the Response from a string defaults the content-type to
	// text/plain when the upstream headers omit it, which makes the browser
	// show the HTML source instead of rendering it. Since we only reach this
	// point for HTML, set the header explicitly.
	if (!headers.get("content-type")?.includes("text/html")) {
		headers.set("content-type", "text/html; charset=utf-8");
	}

	// Path-based previews share a hostname with the management UI. Give the
	// uploaded document an opaque origin while preserving common static-page
	// features. In particular, never add allow-same-origin here.
	headers.set(
		"content-security-policy",
		"sandbox allow-downloads allow-forms allow-modals allow-popups allow-presentation allow-scripts",
	);

	return new Response(rewrittenHtml, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

function rewritePathBasedAssetUrls(html: string, slug: string): string {
	const prefix = `/sites/${slug}`;

	return html.replace(
		/\b(href|src)=(['"])(\/(?!\/|sites\/|cdn-cgi\/|api\/)[^'"]*)\2/g,
		(_match, attr, quote, path) => {
			return `${attr}=${quote}${prefix}${path}${quote}`;
		},
	);
}

/** Redirect /sites/slug to /sites/slug/ in path-based mode. */
function shouldRedirectPathBasedRoot(
	request: Request,
	env: Env,
	slug: string,
): boolean {
	if (!isTestingMode(request, env)) {
		return false;
	}

	const url = new URL(request.url);
	return url.pathname === `/sites/${slug}`;
}

function siteDomain(env: Env): string {
	return env.SITE_DOMAIN || "internal-company.com";
}

function deployPath(env: Env): string {
	return env.DEPLOY_PATH || "/deploy";
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "Unknown error";
}

// ── Test helpers ─────────────────────────────────────────────────────────────

/** Reset the lazy-init flag (used by tests to ensure clean state). */
export function resetDbInitialized(): void {
	dbInitialized = false;
}

// ── Export ────────────────────────────────────────────────────────────────────

export default app;
