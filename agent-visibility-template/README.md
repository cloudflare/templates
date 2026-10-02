# AI Agent Visibility

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/agent-visibility-template)

<!-- dash-content-start -->

Search is shifting from links to answers. To show up in those answers, your content has to be readable by AI agents and crawlers — in whatever convention each one looks for. This template makes your site visible across **every** agent-discovery surface from a single content store, powered by [Workers AI](https://developers.cloudflare.com/workers-ai/).

**How it works:** the Worker enriches your content once with Workers AI — deriving a clean title, an agent-friendly summary, key points, and topic tags — caches it in [KV](https://developers.cloudflare.com/kv/), then projects that one store onto every surface an agent might request:

- **`/llms.txt`** and **`/llms-full.txt`** — the [llms.txt](https://llmstxt.org) index conventions
- **`/index.json`** — a typed JSON index for structured agents
- **`/<slug>.md`** — clean per-page Markdown, ideal for grounding and citation
- **`/robots.txt`** — explicit directives that welcome named AI crawlers
- **`Content-Signal` headers** — declare how agents may use your content
- **JSON-LD** (`/jsonld`, `/<slug>.jsonld`) — schema.org structured data for classic and AI crawlers
- **Web Bot Auth** _(optional)_ — verify the identity of signed agents (RFC 9421, Ed25519)

The same data, in whichever shape an agent prefers. A bundled UI lets you preview and copy each surface live.

This template ships with sample content so it works the moment you deploy it. Point it at your own pages by editing `src/lib/content.ts`, or POST content to `/api/resources` to enrich it on the fly.

<!-- dash-content-end -->

## Who is this for

- **Anyone who wants to show up in AI answers.** If readers increasingly ask ChatGPT, Claude, or Perplexity instead of clicking a search result, this gives those agents a clean, structured copy of your content to cite.
- **Developers exploring AEO (Answer Engine Optimization).** A working reference for the emerging set of agent-discovery conventions, all in one Worker.
- **Teams who keep getting agent 4xxs.** If bot analytics show AI agents hitting paths they can't read, this is the fix: serve them content they can.

> Looking for a commerce-specific version? See the [`commerce-llms-txt-template`](../commerce-llms-txt-template) for a product-catalog–focused `/llms.txt`. This template is the general, multi-surface counterpart.

## Getting Started

Outside of this repo, you can start a new project with this template using [C3](https://developers.cloudflare.com/learning-paths/workers/get-started/first-worker/) (the `create-cloudflare` CLI):

```bash
npm create cloudflare@latest -- --template=cloudflare/templates/agent-visibility-template
```

A live preview is generated for every pull request via the Deploy to Cloudflare button above.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a KV namespace and add its ID to `wrangler.jsonc` (replace the example namespace ID):

   ```bash
   npx wrangler kv namespace create VISIBILITY_CACHE
   ```

3. Set your site identity in `wrangler.jsonc` under `vars` (`SITE_NAME`, `SITE_DESCRIPTION`).

4. (Optional) To use the runtime write API, set an admin secret — the
   `POST` routes are disabled until you do:

   ```bash
   npx wrangler secret put ADMIN_TOKEN
   ```

5. Run locally:

   ```bash
   npm run dev
   ```

6. Deploy:

   ```bash
   npm run deploy
   ```

## After it deploys

The Worker is live immediately with the bundled sample content — no data source
required. Visit the root URL for the surface explorer UI, then check the live
agent surfaces:

- `https://<your-worker>/llms.txt` and `/llms-full.txt`
- `https://<your-worker>/index.json`
- `https://<your-worker>/getting-started.md` (any sample slug)
- `https://<your-worker>/robots.txt`

The first request to a surface enriches the content with Workers AI and caches
it; subsequent requests are served from KV. Replace the sample content (see
[Adding your own content](#adding-your-own-content)) to make it yours.

## Configuration

All configuration lives in `wrangler.jsonc` under `vars`:

| Variable               | Description                                                   | Default                                    |
| ---------------------- | ------------------------------------------------------------- | ------------------------------------------ |
| `SITE_NAME`            | Your site's name, shown across every surface                  | `Acme Docs`                                |
| `SITE_DESCRIPTION`     | One-line description for agents                               | _(sample)_                                 |
| `AI_MODEL`             | Workers AI model used for enrichment                          | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` |
| `ENRICHMENT_CACHE_TTL` | Seconds to cache enriched records in KV                       | `3600`                                     |
| `CONTENT_SIGNAL`       | Content-Signal policy (emitted in robots.txt and as a header) | `ai-input=yes, search=yes, ai-train=no`    |
| `ENABLE_WEB_BOT_AUTH`  | Expose the optional agent-identity surface                    | `false`                                    |

Secrets (set with `npx wrangler secret put <NAME>`, never committed):

| Secret        | Description                                                                                                                            |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `ADMIN_TOKEN` | Bearer token required by the mutating API routes (`POST /api/resources`, `POST /api/refresh`). While unset, those routes return `401`. |

## Adding your own content

**Option A — edit the source:** replace the entries in `src/lib/content.ts` with your own pages (`slug`, `url`, optional `title`, and `body` as HTML or Markdown), then redeploy.

**Option B — POST at runtime:** with `ADMIN_TOKEN` set, send content to the API and it's enriched and added immediately:

```bash
curl -X POST https://your-worker.workers.dev/api/resources \
  -H "authorization: Bearer $ADMIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{"slug":"about","url":"https://example.com/about","title":"About","body":"<h1>About us</h1>..."}'
```

Slugs must match `^[a-z0-9-]{1,63}$`, `url` must be `http(s)`, bodies are capped
at 100 KB, and the store holds up to 100 resources. Call `POST /api/refresh`
(also authenticated) to clear the cache and re-enrich from source.

## Endpoints

| Method | Path                                  | Description                                                  |
| ------ | ------------------------------------- | ------------------------------------------------------------ |
| GET    | `/llms.txt`                           | llms.txt index (Markdown)                                    |
| GET    | `/llms-full.txt`                      | Full content inlined (Markdown)                              |
| GET    | `/index.json`                         | Typed JSON index                                             |
| GET    | `/:slug.md`                           | Per-page Markdown                                            |
| GET    | `/:slug.jsonld`                       | Per-page schema.org JSON-LD                                  |
| GET    | `/jsonld`                             | Site-level schema.org JSON-LD                                |
| GET    | `/robots.txt`                         | AI-bot directives                                            |
| GET    | `/api/site`                           | Site config + surface list (used by the UI)                  |
| GET    | `/api/resources`                      | Enriched resources as JSON                                   |
| GET    | `/api/resources/:slug`                | A single enriched resource                                   |
| POST   | `/api/resources`                      | Enrich and add/replace a resource _(requires `ADMIN_TOKEN`)_ |
| POST   | `/api/refresh`                        | Clear the enrichment cache _(requires `ADMIN_TOKEN`)_        |
| GET    | `/.well-known/web-bot-auth/directory` | Trusted agent keys _(if enabled)_                            |
| POST   | `/api/identity`                       | Verify a signed agent request _(if enabled)_                 |

## Caching

Enrichment is the expensive step (one Workers AI call per page), so results are
cached in KV under a single key and reused until `ENRICHMENT_CACHE_TTL` expires
(default 1 hour). A `POST /api/resources` enriches only the new/changed page and
updates the cache in place; `POST /api/refresh` clears the cache so the next
read re-enriches from source. If Workers AI is briefly unavailable, the Worker
falls back to deterministic enrichment and caches that degraded result for only
60 seconds so a transient outage can't poison your surfaces for the full TTL.

## Known limitations

- **Enrichment runs on the request path.** The first request after a cold cache
  enriches all pages inline, so it's slower than cached reads. For large sites,
  move enrichment to a [Queue](https://developers.cloudflare.com/queues/) or a
  scheduled [Cron Trigger](https://developers.cloudflare.com/workers/configuration/cron-triggers/).
- **The store lives in two KV keys** and is capped at 100 resources / 100 KB per
  body to stay well within KV limits. For larger catalogs, switch to one KV key
  per resource (or D1) and add pagination.
- **KV is eventually consistent.** After a `POST`, a surface read in another
  region may briefly serve the previous version.
- **Runtime writes use KV read-modify-write.** The mutating API is intended for
  lightweight admin updates. Avoid concurrent writes; for high-volume or
  multi-writer workflows, serialize writes through a Durable Object or move the
  store to D1.
- **Web Bot Auth is a minimal reference** (see below), not a hardened
  implementation — review the current drafts before relying on it.

## Optional: Web Bot Auth (agent identity)

Everything above is about making content **readable**. Web Bot Auth is a
different axis — letting a well-behaved agent prove **who it is** with signed
requests ([RFC 9421](https://www.rfc-editor.org/rfc/rfc9421), Ed25519). It's
off by default. Set `ENABLE_WEB_BOT_AUTH=true` to expose a key directory at
`/.well-known/web-bot-auth/directory` and a verification endpoint at
`/api/identity`. Replace the sample keys in `src/lib/web-bot-auth.ts` with the
keys of agents you actually trust, and review the latest Web Bot Auth drafts
before relying on it in production.

## Testing

```bash
npm test
```

The test suite seeds the KV cache before hitting the public surfaces, so it can
run locally without making Workers AI requests.

## License

See the repository [LICENSE](../LICENSE).
