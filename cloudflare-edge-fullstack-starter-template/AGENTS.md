# AGENTS.md — guide for AI coding agents

This file orients AI tools (Cursor, Claude Code, Copilot, Cloudflare's app
builder) working in this repo. Paste-able context, kept short and accurate.

## What this is

A single Cloudflare Worker that serves a React SPA and a JSON API on **one
origin**. It demonstrates auth + database + file uploads, each wired the
cost-efficient way. No external services, no SDK — everything talks to
Cloudflare bindings directly.

- **`server/index.ts`** — Hono app. Routes: `/api/auth/*` (better-auth),
  `/api/notes` (D1), `/api/files` (R2). Everything else → the React SPA.
- **`server/auth.ts`** — better-auth config: sessions in KV, PBKDF2 hashing.
- **`server/ensure-schema.ts`** — creates tables on first request if missing.
- **`client/`** — React 19 + Vite + Tailwind. `lib/api.ts` is the fetch client.

## Bindings (in `wrangler.jsonc`)

| Binding    | Type   | Use                                                       |
| ---------- | ------ | --------------------------------------------------------- |
| `DB`       | D1     | Notes + auth tables (`user` / `account` / `verification`) |
| `SESSIONS` | KV     | Sessions (the only place they live)                       |
| `BUCKET`   | R2     | Uploaded files                                            |
| `ASSETS`   | static | The built SPA                                             |

Plus one secret: `BETTER_AUTH_SECRET`.

## Cardinal rules

1. **Scope every data access to the signed-in user.** Server routes read the
   session via `requireUser` and use `WHERE user_id = c.var.user.id`. Never add
   a route that returns or mutates another user's rows. File access is checked
   against the caller's `uploads/<userId>/` key prefix.
2. **Keep sessions in KV.** Don't add a `session` table or enable
   `storeSessionInDatabase` — it reintroduces the D1-read-per-request cost this
   template avoids, and cookieCache + secondaryStorage together breaks logout
   (better-auth #4203). The auth check should stay a KV read.
3. **Bind values, never interpolate them into SQL.** Use `?` placeholders with
   `.bind(...)` (see `server/index.ts`). Table/column names are fixed literals
   in this codebase — keep it that way; don't interpolate user input as an
   identifier.
4. **Auth is same-origin.** The SPA and API share one Worker, so the session
   cookie is first-party. Don't split the API onto another origin without
   revisiting the cookie attributes (you'd need `SameSite=None; Secure`).

## Where to add things

| Task                         | Where                                                                                           |
| ---------------------------- | ----------------------------------------------------------------------------------------------- |
| A new table                  | Add `CREATE TABLE IF NOT EXISTS` to `server/ensure-schema.ts` AND a migration in `migrations/`. |
| A new API route              | `server/index.ts`, gated with the `requireUser` middleware.                                     |
| A new page                   | `client/pages/`, wired into `client/App.tsx`.                                                   |
| OAuth / email / verification | `server/auth.ts` — see the README "Going further" note.                                         |

## Don't

- Don't proxy file downloads through the Worker at scale — use presigned R2
  URLs (needs an R2 S3 keypair). The binding upload here is for zero-config
  simplicity; the README explains the production path.
- Don't commit `.dev.vars` or `BETTER_AUTH_SECRET`.
- Don't add heavyweight dependencies — the whole app is a handful of files on
  purpose.
