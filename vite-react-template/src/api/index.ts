import { Hono } from "hono";
const app = new Hono<{ Bindings: Env }>();

app.get("/api/", (c) => c.json({ name: "Cloudflare" }));

app.get("*", (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
