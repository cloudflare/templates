import { Hono } from "hono";
import { setDb } from "./db/db";
import { authRoutes } from "./routes/auth";
import { exampleRoutes } from "./routes/example";
import { previewRoutes } from "./routes/preview";
import { webhookRoutes } from "./lifecycle/webhooks";
import type { Env } from "./types/env";
import { requireShop } from "./middleware/requireShop";

const app = new Hono<{ Bindings: Env }>();

// Middleware: init Drizzle DB client per request
app.use("*", async (c, next) => {
	setDb(c.env.DB);
	await next();
});

// All /api/* routes require an authenticated shop — see middleware/requireShop.ts
app.use("/api/*", requireShop);

// Routes
app.route("/", authRoutes);
app.route("/", webhookRoutes);
app.route("/", exampleRoutes);

// Public template preview page (no auth) — see routes/preview.ts.
app.route("/", previewRoutes);

// Health check
app.get("/health", (c) =>
	c.json({ status: "ok", app: "shopify-on-cloudflare" }),
);

// Catch-all: serve SPA and static assets via Cloudflare Assets binding.
// Must be last so all Worker routes (auth, API, webhooks) take priority.
app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));

// Exported for integration tests (see src/api.integration.test.ts).
export { app };

export default {
	fetch: app.fetch,
};
