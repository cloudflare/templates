import { Hono } from "hono";
import { createShopify, createSessionStorage } from "../shopify";
import { onShopInstall } from "../lifecycle/install";
import type { Env } from "../types/env";
import { createDb } from "../db/db";
import { shopifyShop } from "../db/schema";
import { eq, and } from "drizzle-orm";

export const authRoutes = new Hono<{ Bindings: Env }>();

authRoutes.get("/shopify/install", async (c) => {
	const shop = c.req.query("shop");
	const host = c.req.query("host");
	console.log(
		`[install] hit — shop=${shop} host=${host ? "present" : "absent"} referer=${c.req.header("referer")} origin=${c.req.header("origin")}`,
	);

	if (!shop) {
		return c.json({ error: "Missing shop parameter" }, 400);
	}

	// Always check install state first — iframe escape is only needed when we
	// actually need to start a fresh OAuth flow. For an existing install we'd
	// otherwise loop: escape → top-level redirect to / → Shopify admin re-loads
	// the iframe at the configured App URL (/shopify/install) → escape again.
	const db = createDb(c.env.DB);
	const existing = await db
		.select({ id: shopifyShop.id })
		.from(shopifyShop)
		.where(
			and(
				eq(shopifyShop.myshopifyDomain, shop),
				eq(shopifyShop.status, "installed"),
			),
		)
		.get();

	console.log(`[install] existing record=${!!existing}`);
	if (existing) {
		// Already installed — go straight to the SPA. Preserve host+embedded so
		// App Bridge can initialize inside the admin iframe.
		const target = host
			? `/?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}&embedded=1`
			: `/?shop=${encodeURIComponent(shop)}`;
		console.log(`[install] already installed, redirecting to ${target}`);
		return c.redirect(target);
	}

	// Not installed.
	//
	// If we're inside the Shopify admin iframe (host param present), we cannot
	// call auth.begin() here — the state cookie would be set in a third-party
	// (cross-site) context and get blocked by modern browsers (Chrome, Safari ITP).
	//
	// window.top.location.href is blocked by browsers for cross-origin frames, so
	// we use App Bridge 4 to break out of the iframe and trigger a top-level
	// navigation to the install URL without the host param, where cookies are set
	// in a first-party context.
	if (host) {
		const topLevelInstall = `https://${c.env.HOST}/shopify/install?shop=${encodeURIComponent(shop)}`;
		console.log(
			`[install] iframe context, not installed — escaping iframe to: ${topLevelInstall}`,
		);
		// App Bridge 4: loading the CDN script with data-api-key auto-initializes
		// the postMessage bridge to the admin shell. `open(url, '_top')` is then
		// intercepted and routed through the bridge for a top-level navigation
		// that escapes the iframe (window.top.location.href is blocked cross-origin).
		const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" data-api-key=${JSON.stringify(c.env.SHOPIFY_CLIENT_ID)}></script>
  <script>
    document.addEventListener('DOMContentLoaded', function () {
      open(${JSON.stringify(topLevelInstall)}, '_top');
    });
  </script>
</head>
<body></body>
</html>`;
		return new Response(html, {
			status: 200,
			headers: { "Content-Type": "text/html" },
		});
	}

	// Top-level, not installed — begin OAuth.
	// auth.begin() sets the state cookie (sameSite: lax) and returns a 302 to
	// Shopify's OAuth consent page. We return the raw 302 so the browser follows it
	// directly; no HTML wrapper needed since we're already top-level.
	//
	// Note: @shopify/shopify-api has an isbot() check that blocks requests with
	// non-browser user agents (e.g. Playwright, curl). We strip any such UA and
	// replace with a plain Chrome UA so the library proceeds normally.
	const shopify = createShopify(c.env);
	const safeHeaders = new Headers(c.req.raw.headers);
	const ua = safeHeaders.get("user-agent") ?? "";
	if (!ua || /playwright|bot|crawl|spider|headless/i.test(ua)) {
		safeHeaders.set(
			"user-agent",
			"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
		);
	}
	const safeRequest = new Request(c.req.raw.url, {
		method: c.req.raw.method,
		headers: safeHeaders,
	});
	const oauthResponse = await shopify.auth.begin({
		shop,
		callbackPath: "/shopify/callback",
		isOnline: false,
		rawRequest: safeRequest,
	});

	const location = oauthResponse.headers.get("Location");
	console.log(
		`[install] auth.begin status=${oauthResponse.status} location=${location}`,
	);

	return oauthResponse;
});

authRoutes.get("/shopify/callback", async (c) => {
	try {
		const shopify = createShopify(c.env);
		const sessionStorage = createSessionStorage(c.env);

		// Same isbot bypass as in install — callback also has an isbot check.
		const cbHeaders = new Headers(c.req.raw.headers);
		const cbUa = cbHeaders.get("user-agent") ?? "";
		if (!cbUa || /playwright|bot|crawl|spider|headless/i.test(cbUa)) {
			cbHeaders.set(
				"user-agent",
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			);
		}
		const cbRequest = new Request(c.req.raw.url, {
			method: c.req.raw.method,
			headers: cbHeaders,
		});
		const callbackResponse = await shopify.auth.callback({
			rawRequest: cbRequest,
		});

		const { session } = callbackResponse;
		const shopDomain = session.shop;
		const now = new Date().toISOString();

		// Store session in KV
		await sessionStorage.storeSession(session);
		console.log(
			`[auth:callback] Session stored in KV for shop=${shopDomain}, session.id=${session.id}, accessToken=${session.accessToken ? "present" : "missing"}`,
		);

		// Verify KV storage
		const verifySession = await sessionStorage.loadSession(session.id);
		console.log(
			`[auth:callback] KV verify: loaded=${!!verifySession}, id=${verifySession?.id}`,
		);

		// Upsert shop record
		const db = createDb(c.env.DB);
		await db
			.insert(shopifyShop)
			.values({
				id: session.id,
				myshopifyDomain: shopDomain,
				status: "installed",
				createdAt: now,
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: shopifyShop.id,
				set: { status: "installed", updatedAt: now },
			});

		// Run install lifecycle hook
		await onShopInstall(
			shopDomain,
			{
				shop: session.shop,
				accessToken: session.accessToken ?? "",
				id: session.id,
			},
			c.env,
		);

		return c.redirect(`/?shop=${shopDomain}`);
	} catch (err) {
		console.error("OAuth callback error:", err);
		return c.json({ error: "OAuth failed" }, 500);
	}
});
