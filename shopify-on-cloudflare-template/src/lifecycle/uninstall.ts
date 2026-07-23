import type { Env } from "../types/env";
import { createDb } from "../db/db";
import { shopifyShop } from "../db/schema";
import { eq } from "drizzle-orm";

export async function onShopUninstall(
	shopDomain: string,
	env: Env,
): Promise<void> {
	const db = createDb(env.DB);
	const now = new Date().toISOString();
	await db
		.update(shopifyShop)
		.set({ status: "uninstalled", updatedAt: now })
		.where(eq(shopifyShop.myshopifyDomain, shopDomain));
}
