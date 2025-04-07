import { Hono } from "hono";
import postgres from "postgres";
import { createRequestHandler } from "react-router";
import booksRouter from "./routes/books";
import bookRelatedRouter from "./routes/book-related";
import { mockBooks } from "./lib/mockData";

const app = new Hono();

// Setup SQL client middleware
app.use("*", async (c, next) => {
  // Check if Hyperdrive binding is available
  if (c.env.HYPERDRIVE) {
    try {
      // Create SQL client
      const sql = postgres(c.env.HYPERDRIVE.connectionString, {
        max: 5,
        fetch_types: false,
      });

      c.env.SQL = sql;
      c.env.DB_AVAILABLE = true;

      // Process the request
      await next();

      // Close the SQL connection after the response is sent
      c.executionCtx.waitUntil(sql.end());
    } catch (error) {
      console.error("Database connection error:", error);
      c.env.DB_AVAILABLE = false;
      c.env.MOCK_DATA = mockBooks;
      await next();
    }
  } else {
    // No Hyperdrive binding available, use mock data
    console.log("No database connection available. Using mock data.");
    c.env.DB_AVAILABLE = false;
    c.env.MOCK_DATA = mockBooks;
    await next();
  }
});

// React Router request handler
const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

// API routes
app.route("/api/books/:id/related", bookRelatedRouter);
app.route("/api/books", booksRouter);

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
