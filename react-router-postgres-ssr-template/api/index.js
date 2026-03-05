import { Hono } from "hono";
import { createRequestHandler } from "react-router";
import { BooksService } from "./books-service";

const app = new Hono();

// React Router request handler
const requestHandler = createRequestHandler(
	() => import("virtual:react-router/server-build"),
	import.meta.env.MODE,
);

// Handle React Router requests
app.get("*", async (c) => {
	return requestHandler(c.req.raw, {
		cloudflare: { env: c.env, ctx: c.executionCtx },
	});
});

// Catch-all route for static assets
app.all("*", async (c) => {
	return c.env.ASSETS.fetch(c.req.raw);
});

export default {
	fetch: app.fetch,
};

export { BooksService };
