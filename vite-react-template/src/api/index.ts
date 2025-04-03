import { Hono } from "hono";
const app = new Hono<{ Bindings: Env }>();

app.get("/message/", (c) => c.json({ name: "Cloudflare" }));

export default app;
