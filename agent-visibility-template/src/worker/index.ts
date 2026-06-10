/**
 * Agent Visibility Worker
 *
 * Serves one enriched content store through every agent-discovery surface:
 *
 *   GET /llms.txt                          — llms.txt index (Markdown)
 *   GET /llms-full.txt                     — full content inlined (Markdown)
 *   GET /index.json                        — typed JSON index
 *   GET /:slug.md                          — per-page Markdown (groundable)
 *   GET /:slug.jsonld                      — per-page schema.org JSON-LD
 *   GET /jsonld                            — site-level schema.org JSON-LD
 *   GET /robots.txt                        — explicit AI-bot directives
 *
 * Plus a small JSON API the bundled UI uses, and an OPTIONAL Web Bot Auth
 * identity surface (disabled unless ENABLE_WEB_BOT_AUTH=true).
 *
 * Every text surface sends a `Content-Signal` header declaring how agents may
 * use the content (see https://contentsignals.org / the Content-Signals
 * proposal). The React SPA at `/` is served from static assets.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
	renderIndexJson,
	renderLlmsFullTxt,
	renderLlmsTxt,
	renderResourceJsonLd,
	renderResourceMd,
	renderRobotsTxt,
	renderWebsiteJsonLd,
} from "../enrichment/surfaces";
import {
	clearCache,
	getResources,
	siteConfig,
	upsertResource,
} from "../lib/store";
import type { Env, RawResource } from "../lib/types";
import {
	directoryDocument,
	SAMPLE_AGENT_KEYS,
	verifyAgentIdentity,
} from "../lib/web-bot-auth";

const app = new Hono<{ Bindings: Env }>();

app.onError((err, c) => {
	console.error(`[Error] ${c.req.method} ${c.req.path}: ${err.message}`);
	// Match the response type to the surface: text surfaces shouldn't get a
	// JSON error body.
	if (/\.(md|txt)$/.test(c.req.path)) {
		return c.text("Internal server error", 500);
	}
	return c.json({ error: "Internal server error" }, 500);
});

function originOf(url: string): string {
	return new URL(url).origin;
}

// --- Validation limits for user-supplied content ---------------------------
const MAX_BODY_BYTES = 100_000; // raw content we'll persist per resource
const MAX_RESOURCES = 100; // cap total resources to bound KV growth
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62})$/;

/** Constant-time-ish bearer check for the mutating routes. */
function isAuthorized(c: {
	env: Env;
	req: { header: (k: string) => string | undefined };
}): boolean {
	const configured = c.env.ADMIN_TOKEN;
	if (!configured) return false;
	const header = c.req.header("authorization") ?? "";
	const token = header.replace(/^Bearer\s+/i, "");
	return token.length > 0 && token === configured;
}

/** Apply the Content-Signal header declaring agent usage intent. */
function contentSignal(c: { env: Env }): Record<string, string> {
	return {
		"Content-Signal":
			c.env.CONTENT_SIGNAL || "ai-input=yes, search=yes, ai-train=no",
	};
}

// CORS so agents can fetch the machine-readable surfaces from anywhere.
app.use("/llms.txt", cors());
app.use("/llms-full.txt", cors());
app.use("/index.json", cors());
app.use("/jsonld", cors());
// NB: Hono's "*" wildcard does not match a literal ".md"/".jsonld" suffix, so
// the per-page surfaces need the same regex matcher their routes use.
app.use("/:file{.+\\.md}", cors());
app.use("/:file{.+\\.jsonld}", cors());

// ---------------------------------------------------------------------------
// Machine-readable surfaces
// ---------------------------------------------------------------------------

app.get("/llms.txt", async (c) => {
	const site = siteConfig(c.env, originOf(c.req.url));
	const resources = await getResources(c.env);
	return c.text(renderLlmsTxt({ site, resources }), 200, {
		"Content-Type": "text/plain; charset=utf-8",
		...contentSignal(c),
	});
});

app.get("/llms-full.txt", async (c) => {
	const site = siteConfig(c.env, originOf(c.req.url));
	const resources = await getResources(c.env);
	return c.text(renderLlmsFullTxt({ site, resources }), 200, {
		"Content-Type": "text/plain; charset=utf-8",
		...contentSignal(c),
	});
});

app.get("/index.json", async (c) => {
	const site = siteConfig(c.env, originOf(c.req.url));
	const resources = await getResources(c.env);
	c.header("Content-Signal", contentSignal(c)["Content-Signal"]);
	return c.json(renderIndexJson({ site, resources }));
});

app.get("/robots.txt", async (c) => {
	const site = siteConfig(c.env, originOf(c.req.url));
	const resources = await getResources(c.env);
	return c.text(
		renderRobotsTxt({
			site,
			resources,
			contentSignal: contentSignal(c)["Content-Signal"],
		}),
		200,
		{
			"Content-Type": "text/plain; charset=utf-8",
			...contentSignal(c),
		},
	);
});

app.get("/jsonld", async (c) => {
	const site = siteConfig(c.env, originOf(c.req.url));
	const resources = await getResources(c.env);
	return c.json(renderWebsiteJsonLd({ site, resources }), 200, {
		"Content-Type": "application/ld+json; charset=utf-8",
		...contentSignal(c),
	});
});

// Per-page Markdown: /:slug.md
app.get("/:file{.+\\.md}", async (c) => {
	const slug = c.req.param("file").replace(/\.md$/, "");
	const site = siteConfig(c.env, originOf(c.req.url));
	const resources = await getResources(c.env);
	const resource = resources.find((r) => r.slug === slug);
	if (!resource) return c.notFound();
	return c.text(renderResourceMd({ resource, site }), 200, {
		"Content-Type": "text/markdown; charset=utf-8",
		...contentSignal(c),
	});
});

// Per-page JSON-LD: /:slug.jsonld
app.get("/:file{.+\\.jsonld}", async (c) => {
	const slug = c.req.param("file").replace(/\.jsonld$/, "");
	const site = siteConfig(c.env, originOf(c.req.url));
	const resources = await getResources(c.env);
	const resource = resources.find((r) => r.slug === slug);
	if (!resource) return c.notFound();
	return c.json(renderResourceJsonLd({ resource, site }), 200, {
		"Content-Type": "application/ld+json; charset=utf-8",
		...contentSignal(c),
	});
});

// ---------------------------------------------------------------------------
// JSON API for the bundled UI
// ---------------------------------------------------------------------------

app.get("/api/site", async (c) => {
	const site = siteConfig(c.env, originOf(c.req.url));
	return c.json({
		site,
		webBotAuthEnabled: c.env.ENABLE_WEB_BOT_AUTH === "true",
		surfaces: [
			{ id: "llms-txt", label: "llms.txt", path: "/llms.txt", kind: "text" },
			{
				id: "llms-full",
				label: "llms-full.txt",
				path: "/llms-full.txt",
				kind: "text",
			},
			{
				id: "index-json",
				label: "index.json",
				path: "/index.json",
				kind: "json",
			},
			{ id: "robots", label: "robots.txt", path: "/robots.txt", kind: "text" },
			{ id: "jsonld", label: "JSON-LD", path: "/jsonld", kind: "json" },
		],
	});
});

app.get("/api/resources", async (c) => {
	const resources = await getResources(c.env);
	return c.json({ count: resources.length, resources });
});

app.get("/api/resources/:slug", async (c) => {
	const resources = await getResources(c.env);
	const resource = resources.find((r) => r.slug === c.req.param("slug"));
	if (!resource) return c.json({ error: "Not found" }, 404);
	return c.json(resource);
});

app.post("/api/resources", async (c) => {
	if (!isAuthorized(c)) {
		return c.json({ error: "Unauthorized. Set the ADMIN_TOKEN secret." }, 401);
	}
	const body = await c.req.json<Partial<RawResource>>().catch(() => null);
	if (!body?.slug || !body?.body) {
		return c.json({ error: "Missing required fields: slug, body" }, 400);
	}

	const slug = String(body.slug);
	if (!SLUG_RE.test(slug)) {
		return c.json({ error: "Invalid slug: use 1–63 chars of [a-z0-9-]." }, 400);
	}

	const rawBody = String(body.body);
	if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) {
		return c.json(
			{ error: `Body too large (max ${MAX_BODY_BYTES} bytes).` },
			400,
		);
	}

	let url = `${originOf(c.req.url)}/${slug}`;
	if (body.url) {
		try {
			const parsed = new URL(String(body.url));
			if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
				return c.json({ error: "url must be http(s)." }, 400);
			}
			url = parsed.toString();
		} catch {
			return c.json({ error: "url is not a valid URL." }, 400);
		}
	}

	const raw: RawResource = {
		slug,
		url,
		title: body.title ? String(body.title).slice(0, 200) : undefined,
		body: rawBody,
	};

	try {
		const enriched = await upsertResource(c.env, raw, MAX_RESOURCES);
		return c.json(enriched, 201);
	} catch (err) {
		if ((err as Error).message === "RESOURCE_LIMIT") {
			return c.json(
				{ error: `Resource limit reached (max ${MAX_RESOURCES}).` },
				409,
			);
		}
		throw err;
	}
});

app.post("/api/refresh", async (c) => {
	if (!isAuthorized(c)) {
		return c.json({ error: "Unauthorized. Set the ADMIN_TOKEN secret." }, 401);
	}
	await clearCache(c.env);
	return c.json({
		ok: true,
		message: "Cache cleared; surfaces will re-enrich.",
	});
});

// ---------------------------------------------------------------------------
// OPTIONAL — Web Bot Auth identity surface (off by default)
// ---------------------------------------------------------------------------

app.get("/.well-known/web-bot-auth/directory", (c) => {
	if (c.env.ENABLE_WEB_BOT_AUTH !== "true") return c.notFound();
	return c.json(directoryDocument(SAMPLE_AGENT_KEYS));
});

app.all("/api/identity", async (c) => {
	if (c.env.ENABLE_WEB_BOT_AUTH !== "true") {
		return c.json({ error: "Web Bot Auth is disabled" }, 404);
	}
	const result = await verifyAgentIdentity(c.req.raw, SAMPLE_AGENT_KEYS);
	return c.json(result);
});

export default app;
