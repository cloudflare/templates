import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../types/env";

// Starter registers only APP_UNINSTALLED. To register more topics, add to this
// list and to the dispatch switch in the webhook handler below. Common topics:
//   'products/create', 'products/update', 'products/delete',
//   'orders/create', 'orders/updated', 'orders/cancelled',
//   'collections/create', 'collections/update', 'collections/delete',
//   'app/uninstalled',
//   'customers/data_request', 'customers/redact', 'shop/redact'  // GDPR
const WEBHOOK_TOPICS = ["app/uninstalled"] as const;

export async function registerWebhooks(
	shopDomain: string,
	accessToken: string,
	env: Env,
): Promise<void> {
	const webhookEndpoint = `https://${env.HOST}/shopify/webhooks`;

	for (const topic of WEBHOOK_TOPICS) {
		try {
			const res = await fetch(
				`https://${shopDomain}/admin/api/2026-04/webhooks.json`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"X-Shopify-Access-Token": accessToken,
					},
					body: JSON.stringify({
						webhook: {
							topic,
							address: webhookEndpoint,
							format: "json",
						},
					}),
				},
			);
			// 422 = already registered, that's fine
			if (!res.ok && res.status !== 422) {
				console.error(`Failed to register webhook ${topic}: ${res.status}`);
			}
		} catch (err) {
			console.error(`Error registering webhook ${topic}:`, err);
		}
	}
}

export async function handleWebhook(
	c: Context<{ Bindings: Env }>,
): Promise<Response> {
	const rawBody = await c.req.text();

	// Verify HMAC signature
	const hmacHeader = c.req.header("X-Shopify-Hmac-Sha256") ?? "";
	const secret = c.env.SHOPIFY_API_SECRET;
	const encoder = new TextEncoder();

	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		encoder.encode(rawBody),
	);
	const computedHmac = btoa(String.fromCharCode(...new Uint8Array(signature)));

	if (computedHmac !== hmacHeader) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const topic = c.req.header("X-Shopify-Topic") ?? "";
	const shopDomain = c.req.header("X-Shopify-Shop-Domain") ?? "";

	// Starter: handle inline. Add queue routing here when you wire up Cloudflare Queues.
	if (topic === "app/uninstalled") {
		const { onShopUninstall } = await import("./uninstall");
		await onShopUninstall(shopDomain, c.env);
	}

	return c.json({ ok: true });
}

const webhookApp = new Hono<{ Bindings: Env }>();
webhookApp.post("/shopify/webhooks", handleWebhook);

export { webhookApp as webhookRoutes };
