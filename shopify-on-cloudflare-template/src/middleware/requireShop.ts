import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types/env.d";
import { getCurrentShopId } from "./shopAuth";

// Routes under /api/* that are intentionally public (no shop auth required).
// Add a path here ONLY with explicit justification — all other /api/* routes
// are protected automatically.
const PUBLIC_API_PATHS = new Set<string>([
	// No public routes by default. Add entries here with a comment explaining why.
]);

export const requireShop: MiddlewareHandler<AppEnv> = async (c, next) => {
	if (PUBLIC_API_PATHS.has(c.req.path)) {
		await next();
		return;
	}

	const shopId = await getCurrentShopId(
		c as unknown as Parameters<typeof getCurrentShopId>[0],
	);
	if (!shopId) return c.json({ error: "Unauthorized" }, 401);

	c.set("shopId", shopId);
	await next();
};
