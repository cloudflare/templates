import { createShopify, createSessionStorage } from "../shopify";
import type { Env } from "../types/env";

const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

/**
 * Returns a valid offline access token for the given shop, refreshing it if
 * near expiry. Use this in background contexts (cron, queues, webhooks) where
 * no App Bridge JWT is available to do a full token exchange.
 *
 * Returns null if no session exists or if refresh fails.
 */
export async function getShopAccessToken(
	shopDomain: string,
	env: Env,
): Promise<string | null> {
	const sessionStorage = createSessionStorage(env);
	const session = await sessionStorage.loadSession(`offline_${shopDomain}`);

	if (!session?.accessToken) {
		console.error(`[getShopAccessToken] no session found for ${shopDomain}`);
		return null;
	}

	if (session.isExpired(EXPIRY_BUFFER_MS) && session.refreshToken) {
		try {
			const shopify = createShopify(env);
			const { session: refreshed } = await shopify.auth.refreshToken({
				shop: shopDomain,
				refreshToken: session.refreshToken,
			});
			await sessionStorage.storeSession(refreshed);
			console.log(
				`[getShopAccessToken] refreshed token for ${shopDomain}, expires=${refreshed.expires?.toISOString()}`,
			);
			return refreshed.accessToken ?? null;
		} catch (err) {
			console.error(
				`[getShopAccessToken] refresh failed for ${shopDomain}:`,
				err,
			);
			// Fall through and return the near-expiry token — better than null for short windows.
		}
	}

	return session.accessToken;
}
