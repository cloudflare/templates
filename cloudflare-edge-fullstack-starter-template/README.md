# Edge Full-Stack Starter

A complete full-stack app on Cloudflare's edge — **user accounts, a database, and file uploads** — wired the cheap way. One click deploys it to your own Cloudflare account, with the D1 database, KV namespace, and R2 bucket all created for you. No external services, no config beyond a single secret.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/cloudflare-edge-fullstack-starter-template)

**[▶ Live demo](https://edge-fullstack-starter.jaan-f97.workers.dev/)**

<!-- dash-content-start -->

A single Cloudflare Worker that serves a React SPA and a JSON API on one origin. It demonstrates the three storage primitives you need for almost any app, each used the cost-efficient way:

- **Auth** — email + password sign-up / sign-in, powered by [better-auth](https://better-auth.com). Sessions live in **KV**, so the auth check on every request is a fast edge read instead of a billed D1 row read.
- **Database** — a per-user "notes" table in **D1** (SQLite). The app's tables and the auth tables share one database, so foreign keys and joins just work.
- **Files** — per-user uploads stored in **R2**, object storage with zero egress fees.

Auth is **same-origin** (the SPA and API are one Worker), so the session cookie is first-party — it works in Safari with no custom-domain or third-party-cookie workarounds. The database schema is created automatically on first request, so a freshly-deployed (empty) database needs no migration step.

**Stack:** Cloudflare Workers · D1 · KV · R2 · Hono · React 19 · Vite · Tailwind CSS · better-auth.

**Bindings:**

| Binding    | Type          | Purpose                                                        |
| ---------- | ------------- | -------------------------------------------------------------- |
| `DB`       | D1            | App data (notes) + auth tables (user / account / verification) |
| `SESSIONS` | KV            | Session storage                                                |
| `BUCKET`   | R2            | Uploaded files                                                 |
| `ASSETS`   | Static assets | The built React SPA                                            |

You also set one secret, `BETTER_AUTH_SECRET` — a random string that signs session tokens.

<!-- dash-content-end -->

## Getting started

### Deploy it (no setup)

Click **Deploy to Cloudflare** above. Cloudflare clones this repo into your GitHub, creates a D1 database, KV namespace, and R2 bucket in your account, prompts you for `BETTER_AUTH_SECRET`, and deploys. About a minute later you have a live app at `your-worker.your-subdomain.workers.dev`.

> Generate a secret with: `openssl rand -base64 32`

### Run it locally

```bash
npm install
cp .dev.vars.example .dev.vars   # then set BETTER_AUTH_SECRET to a random string
npm run dev                      # http://localhost:5173
```

`npm run dev` runs the Worker in Miniflare with **local, emulated** D1 / KV / R2 — nothing is created in your Cloudflare account and you can work offline. Sign up, write a note, attach a file.

### Deploy from the CLI

```bash
npm run deploy   # vite build && wrangler deploy
```

This expects the `DB` / `SESSIONS` / `BUCKET` bindings in [`wrangler.jsonc`](./wrangler.jsonc) to point at resources in your account (create them with `wrangler d1 create`, `wrangler kv namespace create`, `wrangler r2 bucket create` and paste the ids), and `BETTER_AUTH_SECRET` set via `wrangler secret put BETTER_AUTH_SECRET`. The Deploy button does all of this for you.

## How it's wired

```
client/                React SPA (Vite + Tailwind)
  pages/Login,Signup    email + password auth screens
  pages/Home            notes list, composer, file attach
  lib/api.ts            typed fetch client
  lib/session.ts        shared current-user hook
server/
  index.ts              Hono app: /api/auth/*, /api/notes, /api/files, SPA
  auth.ts               better-auth (KV sessions, PBKDF2 hashing)
  ensure-schema.ts      creates the tables on first request if missing
  schema.ts             drizzle models for the auth tables
migrations/             the same schema, for `wrangler d1 migrations apply`
```

Every app route is scoped to the signed-in user (`WHERE user_id = ...`), so one user can never read or write another's notes or files.

## The cost patterns (why this template exists)

The defaults here are the ones that keep your Cloudflare bill near zero:

1. **Sessions in KV, not D1.** D1 bills per row read; an auth check runs on every authenticated request. KV reads are edge-cached and effectively free at this scale. See [`server/auth.ts`](./server/auth.ts).
2. **One D1 for app + auth.** One database, one billing line, real foreign keys.
3. **Files in R2.** No egress fees, unlike S3.

## Going further

This template optimizes for **zero-config**, which means two deliberate simplifications:

- **Uploads go through the Worker** (`env.BUCKET.put`) because that needs only the R2 binding the Deploy button provisions. At production scale you'd switch to **presigned direct-to-R2 uploads** so bytes never touch your Worker (no CPU, no request body limits) — that requires an R2 S3 access keypair and SigV4 signing.
- **Email verification is off**, because delivering a verification link needs an email provider. Add one (Cloudflare Email or Resend) and set `requireEmailVerification: true` in `server/auth.ts`.

Wiring presigned uploads, email, OAuth providers, custom domains, a table editor, and cost monitoring by hand — across more than one app — is exactly the tedium [**Flarelink**](https://flarelink.dev) removes: it's a dashboard for the Cloudflare developer stack (auth + D1 + KV + R2 + email) with built-in cost coaching. This template is the DIY version of what Flarelink manages for you.

## License

MIT — see [LICENSE](./LICENSE). Use it, fork it, ship it.
