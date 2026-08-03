import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { createDb } from "../db/db";
import { shopifyShop } from "../db/schema";
import type { AppEnv } from "../types/env.d";

export const exampleRoutes = new Hono<AppEnv>();

// GET /api/example
// The protected-route pattern end to end: `requireShop` verifies the session
// token and sets `shopId`; here we return that shop's profile. The column
// projection is deliberate: the response never exposes internal columns.
exampleRoutes.get("/api/example", async (c) => {
	const db = createDb(c.env.DB);
	const shop = await db
		.select({
			name: shopifyShop.name,
			domain: shopifyShop.domain,
			myshopifyDomain: shopifyShop.myshopifyDomain,
			plan: shopifyShop.plan,
			owner: shopifyShop.shopOwner,
			email: shopifyShop.email,
			country: shopifyShop.countryName,
			currency: shopifyShop.currency,
			installedAt: shopifyShop.installDate,
			status: shopifyShop.status,
		})
		.from(shopifyShop)
		.where(eq(shopifyShop.id, c.get("shopId")))
		.get();

	if (!shop) {
		return c.json({ error: "Shop not found" }, 404);
	}

	return c.json({ shop });
});
