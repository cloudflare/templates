// Edge Full-Stack Starter — the Worker.
//
// One Worker serves everything on a single origin:
//   1. /api/auth/*  — better-auth (signup / signin / signout / session).
//   2. /api/notes   — the demo app: per-user notes in D1, scoped by user_id.
//   3. /api/files   — file uploads to R2 via the bucket binding.
//   4. everything else — the React SPA, served by the ASSETS binding.
//
// Because the SPA and the API share an origin, the session cookie is
// first-party: no cross-site cookie configuration, and it works in Safari.

import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "./env.ts";
import { createAuth } from "./auth.ts";
import { ensureSchema } from "./ensure-schema.ts";

const app = new Hono<AppEnv>();

// Never let an auth/API response sit in a shared cache — it could replay one
// user's session response to another. CF doesn't edge-cache Worker responses by
// default, but a customer-added Cache Rule could; this header overrides it.
app.use("/api/*", async (c, next) => {
	await next();
	c.res.headers.set("Cache-Control", "no-store");
});

// Create the tables on first request if a fresh D1 is empty (see ensure-schema).
app.use("/api/*", async (c, next) => {
	await ensureSchema(c.env);
	await next();
});

// --- auth ------------------------------------------------------------------

app.on(["GET", "POST"], "/api/auth/*", (c) => {
	const baseURL = new URL(c.req.url).origin;
	return createAuth(c.env, baseURL).handler(c.req.raw);
});

// requireUser — populates c.var.user from the session cookie or 401s. Every
// app route below it is scoped to c.var.user.id so one user can never read or
// write another's rows.
const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
	const baseURL = new URL(c.req.url).origin;
	const auth = createAuth(c.env, baseURL);
	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	if (!session?.user)
		return c.json({ error: "Not signed in", code: "UNAUTHENTICATED" }, 401);
	c.set("user", {
		id: session.user.id,
		email: session.user.email,
		name: session.user.name ?? null,
	});
	await next();
};

// --- notes (D1) ------------------------------------------------------------

const MAX_NOTE_LEN = 10_000;

app.get("/api/notes", requireUser, async (c) => {
	const { results } = await c.env.DB.prepare(
		`SELECT id, content, attachment_key, attachment_name, created_at
       FROM notes WHERE user_id = ? ORDER BY created_at DESC LIMIT 200`,
	)
		.bind(c.var.user.id)
		.all<{
			id: string;
			content: string;
			attachment_key: string | null;
			attachment_name: string | null;
			created_at: number;
		}>();
	return c.json({
		notes: results.map((r) => ({
			id: r.id,
			content: r.content,
			attachmentKey: r.attachment_key,
			attachmentName: r.attachment_name,
			createdAt: r.created_at,
		})),
	});
});

app.post("/api/notes", requireUser, async (c) => {
	type Body = {
		content?: string;
		attachmentKey?: string;
		attachmentName?: string;
	};
	const body = await c.req.json<Body>().catch((): Body => ({}));
	const content = (body.content ?? "").trim();
	if (!content) return c.json({ error: "content is required" }, 400);
	if (content.length > MAX_NOTE_LEN)
		return c.json({ error: "content too long" }, 400);

	// If an attachment is claimed, it must live under this user's own prefix —
	// a client can't attach someone else's uploaded key to their note.
	let attachmentKey: string | null = null;
	let attachmentName: string | null = null;
	if (body.attachmentKey) {
		if (!body.attachmentKey.startsWith(`uploads/${c.var.user.id}/`)) {
			return c.json({ error: "attachment does not belong to you" }, 403);
		}
		attachmentKey = body.attachmentKey;
		attachmentName = (body.attachmentName ?? "").slice(0, 200) || null;
	}

	const { results } = await c.env.DB.prepare(
		`INSERT INTO notes (user_id, content, attachment_key, attachment_name)
       VALUES (?, ?, ?, ?)
       RETURNING id, content, attachment_key, attachment_name, created_at`,
	)
		.bind(c.var.user.id, content, attachmentKey, attachmentName)
		.all<{
			id: string;
			content: string;
			attachment_key: string | null;
			attachment_name: string | null;
			created_at: number;
		}>();
	const r = results[0];
	return c.json({
		note: {
			id: r.id,
			content: r.content,
			attachmentKey: r.attachment_key,
			attachmentName: r.attachment_name,
			createdAt: r.created_at,
		},
	});
});

app.delete("/api/notes/:id", requireUser, async (c) => {
	const id = c.req.param("id");
	// Look up the attachment first so we can clean up the R2 object too.
	const row = await c.env.DB.prepare(
		`SELECT attachment_key FROM notes WHERE id = ? AND user_id = ?`,
	)
		.bind(id, c.var.user.id)
		.first<{ attachment_key: string | null }>();
	if (!row) return c.json({ error: "not found" }, 404);

	await c.env.DB.prepare(`DELETE FROM notes WHERE id = ? AND user_id = ?`)
		.bind(id, c.var.user.id)
		.run();
	if (row.attachment_key) {
		// Best-effort — a failed object delete shouldn't fail the note delete.
		await c.env.BUCKET.delete(row.attachment_key).catch(() => {});
	}
	return c.json({ ok: true });
});

// --- files (R2) ------------------------------------------------------------
//
// Upload goes THROUGH the Worker via the bucket binding (env.BUCKET.put). This
// is the zero-config path: it needs only the R2 binding the Deploy button
// already provisions. At production scale you'd switch to presigned
// direct-to-R2 uploads so bytes never touch the Worker — see the README.

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB — plenty for the demo.

function safeName(name: string): string {
	const base = name.split(/[\\/]/).pop() ?? "file";
	return base.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "file";
}

app.post("/api/files", requireUser, async (c) => {
	const len = Number(c.req.header("content-length") ?? "0");
	if (len > MAX_UPLOAD_BYTES)
		return c.json({ error: "file too large (max 25 MB)" }, 413);
	if (!c.req.raw.body) return c.json({ error: "empty body" }, 400);

	const name = safeName(c.req.header("x-filename") ?? "file");
	const contentType =
		c.req.header("content-type") || "application/octet-stream";
	const key = `uploads/${c.var.user.id}/${crypto.randomUUID()}/${name}`;

	const obj = await c.env.BUCKET.put(key, c.req.raw.body, {
		httpMetadata: { contentType },
	});
	if (!obj) return c.json({ error: "upload failed" }, 502);
	return c.json({ key, name });
});

app.get("/api/files", requireUser, async (c) => {
	const key = c.req.query("key") ?? "";
	// Defense in depth: only ever serve objects under the caller's own prefix.
	if (!key.startsWith(`uploads/${c.var.user.id}/`)) {
		return c.json({ error: "forbidden" }, 403);
	}
	const obj = await c.env.BUCKET.get(key);
	if (!obj) return c.json({ error: "not found" }, 404);

	const headers = new Headers();
	obj.writeHttpMetadata(headers);
	headers.set("etag", obj.httpEtag);
	headers.set("cache-control", "private, max-age=3600");
	const filename = key.split("/").pop() ?? "file";
	headers.set("content-disposition", `inline; filename="${filename}"`);
	return new Response(obj.body, { headers });
});

// Fallback: the asset binding handles non-/api paths directly (run_worker_first
// is scoped to /api/*), so this is just belt-and-braces for the SPA.
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
