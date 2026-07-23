import type { Env } from "../types/env";
import { registerWebhooks } from "./webhooks";
import { createDb } from "../db/db";
import { shopifyShop } from "../db/schema";
import { eq } from "drizzle-orm";

// Called from src/routes/auth.ts after Shopify OAuth completes.
// The starter ships with the minimum: hydrate the shop row, register webhooks.
// Add Slack pings, welcome emails, seed settings, sync enqueues here in your app.
export async function onShopInstall(
	shopDomain: string,
	session: { shop: string; accessToken: string; id: string },
	env: Env,
): Promise<void> {
	const now = new Date().toISOString();
	const db = createDb(env.DB);

	// 1. Fetch shop details from Shopify REST.
	let name = "";
	let email = "";
	let city = "";
	let countryName = "";
	let domain = "";
	let shopOwner = "";
	let currency = "";
	let ianaTimezone = "";
	let primaryLocale = "";

	try {
		const res = await fetch(
			`https://${shopDomain}/admin/api/2026-04/shop.json`,
			{
				headers: { "X-Shopify-Access-Token": session.accessToken },
			},
		);
		if (res.ok) {
			const data = await res.json<{ shop: Record<string, string> }>();
			name = data.shop.name ?? "";
			email = data.shop.email ?? "";
			city = data.shop.city ?? "";
			countryName = data.shop.country_name ?? "";
			domain = data.shop.domain ?? "";
			shopOwner = data.shop.shop_owner ?? "";
			currency = data.shop.currency ?? "";
			ianaTimezone = data.shop.iana_timezone ?? "";
			primaryLocale = data.shop.primary_locale ?? "";
		} else {
			console.error(
				`[install] shop.json fetch failed: ${res.status} ${res.statusText} for ${shopDomain}`,
			);
		}
	} catch (err) {
		console.error(`[install] shop.json fetch threw for ${shopDomain}:`, err);
	}

	// 2. Upsert shop row.
	await db
		.update(shopifyShop)
		.set({
			name,
			email,
			city,
			countryName,
			domain,
			shopOwner,
			currency,
			ianaTimezone,
			primaryLocale,
			installDate: now,
			status: "installed",
			updatedAt: now,
		})
		.where(eq(shopifyShop.myshopifyDomain, shopDomain));

	// 3. Register webhooks with Shopify.
	// Starter only registers APP_UNINSTALLED. Add more topics in src/lifecycle/webhooks.ts.
	await registerWebhooks(shopDomain, session.accessToken, env);
}
