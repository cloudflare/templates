import { Hono } from "hono";
import type { AppEnv } from "../types/env.d";

export const exampleRoutes = new Hono<AppEnv>();

// GET /api/example
// Demonstrates the protected-route pattern: `requireShop` middleware in
// src/index.ts populates `c.get('shopId')` before this handler runs.
exampleRoutes.get("/api/example", (c) => {
	const shopId = c.get("shopId");
	return c.json({ shopId, now: new Date().toISOString() });
});
