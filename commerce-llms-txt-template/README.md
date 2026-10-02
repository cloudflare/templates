# Commerce llms.txt

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/commerce-llms-txt-template)

<!-- dash-content-start -->

Make your product catalog visible to AI shopping agents. This template serves a dynamic `/llms.txt` endpoint that uses [Workers AI](https://developers.cloudflare.com/workers-ai/) to transform raw product specs into natural language descriptions agents can reason with.

**How it works:** Connect your Shopify store (or use the included sample catalog), and the Worker enriches each product's technical specifications into agent-friendly summaries, use-case tags, and buyer highlights. The enriched catalog is cached in [KV](https://developers.cloudflare.com/kv/) and served as a structured `/llms.txt` endpoint that any AI agent can consume in a single request. A small React SPA is bundled alongside the API at `/`, so a human visiting the domain sees the raw merchant data and the enriched output side-by-side.

**Key features:**

- Dynamic `/llms.txt` and `/llms-full.txt` endpoints following the [llms.txt spec](https://llmstxt.org)
- AI enrichment powered by Workers AI (Gemma 4) — turns "DIN 0.75-3.0" into "bindings release easily for toddler safety"
- KV-backed caching with configurable TTL — no re-enrichment on cold starts
- Shopify integration via public `/products.json` API
- Configurable merchant vertical to tailor AI descriptions per industry
- JSON API for programmatic access (`/api/products`, `/api/products/:slug`, `/api/raw-catalog`)
- Built-in React + Vite landing page that visualizes the raw → enriched transformation live against your own catalog

<!-- dash-content-end -->

## Who is this for

- **Merchants who want AI agents to recommend their products.** If you sell on Shopify and want ChatGPT, Perplexity, or other AI shopping agents to understand your catalog, this gives them a structured endpoint to consume.
- **Developers building AI shopping experiences.** If you're building an agent that recommends products, this is the merchant-side counterpart — a standardized, enriched product feed your agent can consume in one request.
- **Platform teams exploring agentic commerce.** If you're evaluating how to make product data agent-readable across a portfolio of stores, this template is a working starting point.

## Getting Started

Outside of this repo, you can start a new project with this template using [C3](https://developers.cloudflare.com/learning-paths/workers/get-started/first-worker/) (the `create-cloudflare` CLI):

```bash
npm create cloudflare@latest -- --template=cloudflare/templates/commerce-llms-txt-template
```

## Setup

The template ships with a sample catalog so you can see it working immediately after deploy. Follow these steps to get live:

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create the KV namespace used to cache enriched products:

   ```bash
   npx wrangler kv namespace create ENRICHMENT_CACHE
   ```

   Copy the namespace ID from the output and paste it into `wrangler.json` in place of the example namespace ID.

   > If you deploy via the "Deploy to Cloudflare" button at the top of this README, the KV namespace is provisioned for you automatically — you can skip this step.

3. Deploy:
   ```bash
   npx wrangler deploy
   ```

Your `/llms.txt` endpoint is now live at `https://commerce-llms-txt-template.<your-subdomain>.workers.dev/llms.txt`. It serves the sample catalog with AI-enriched descriptions.

### Connect your Shopify store (optional)

Configure your store in `wrangler.json` — set `MERCHANT_NAME`, `MERCHANT_DESCRIPTION`, and `SHOPIFY_STORE_DOMAIN`:

```json
{
	"vars": {
		"MERCHANT_NAME": "Your Store Name",
		"MERCHANT_DESCRIPTION": "A short description for AI agents",
		"SHOPIFY_STORE_DOMAIN": "your-store.myshopify.com",
		"MERCHANT_VERTICAL": "outdoor gear"
	}
}
```

Then redeploy with `npx wrangler deploy`.

## After Deploy

Once deployed, your Worker serves an agent-readable product catalog. Here's how to put it to use:

**Point your domain at it.** Add a [Custom Domain](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) or [Route](https://developers.cloudflare.com/workers/configuration/routing/routes/) so `/llms.txt` is served from your store's actual domain (e.g., `yourstore.com/llms.txt`). AI agents and crawlers will discover it the same way they find `robots.txt`.

**Test it with an agent.** Try asking ChatGPT or another AI assistant: "What products does [your store URL] sell?" If the agent supports web browsing, it can fetch your `/llms.txt` and reason about your catalog directly.

**Monitor usage.** Use `npx wrangler tail` or the [Workers dashboard](https://dash.cloudflare.com/) to see requests to your `/llms.txt` endpoint and which agents are consuming it.

## Endpoints

| Endpoint                  | Description                                                                      |
| ------------------------- | -------------------------------------------------------------------------------- |
| `GET /`                   | React SPA: side-by-side view of raw merchant data and Workers AI–enriched output |
| `GET /llms.txt`           | Agent-optimized product catalog (concise)                                        |
| `GET /llms-full.txt`      | Detailed version with specs and highlights                                       |
| `GET /api/products`       | Full enriched catalog as JSON                                                    |
| `GET /api/products/:slug` | Single product detail                                                            |
| `GET /api/raw-catalog`    | Raw merchant catalog (pre-enrichment) — the input to Workers AI                  |
| `GET /api`                | API documentation                                                                |

## Configuration

Set these in the `vars` section of `wrangler.json`:

| Variable               | Description                                                                                                     | Default                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `MERCHANT_NAME`        | Your store name                                                                                                 | `"My Store"`                                     |
| `MERCHANT_DESCRIPTION` | Short store description for the llms.txt header                                                                 | `"Product catalog powered by Commerce llms.txt"` |
| `STORE_CURRENCY`       | Currency code                                                                                                   | `"USD"`                                          |
| `SHIPPING_POLICY`      | Shipping policy (shown in llms.txt header)                                                                      | _(empty)_                                        |
| `RETURN_POLICY`        | Return policy (shown in llms.txt header)                                                                        | _(empty)_                                        |
| `MERCHANT_VERTICAL`    | Your product vertical — guides how AI describes products (e.g., `"outdoor gear"`, `"electronics"`, `"fashion"`) | `"general retail"`                               |
| `SHOPIFY_STORE_DOMAIN` | Your `*.myshopify.com` domain                                                                                   | _(empty — uses sample catalog)_                  |
| `ENRICHMENT_CACHE_TTL` | How long enriched products are cached, in seconds                                                               | `"3600"`                                         |
| `AI_MODEL`             | Workers AI model ID for enrichment — swap to a different model if needed                                        | `"@cf/google/gemma-4-26b-a4b-it"`                |

### Secrets

For password-protected Shopify stores:

```bash
npx wrangler secret put SHOPIFY_STORE_PASSWORD
```

## Development

```bash
npm run dev      # Vite dev server + Miniflare for the Worker (HMR for the SPA)
npm run build    # Build the SPA + bundle the Worker (via @cloudflare/vite-plugin)
npm run preview  # Build, then run the production bundle locally
npm run test     # Run vitest tests
npm run check    # Type check + build + dry-run deploy
```

Under the hood the template uses [`@cloudflare/vite-plugin`](https://www.npmjs.com/package/@cloudflare/vite-plugin): a single `vite build` produces both the static SPA (output to `dist/client/`, served as Workers Static Assets) and the Worker bundle (uploaded by Wrangler). The Worker only handles routes it explicitly defines (`/llms.txt`, `/llms-full.txt`, `/api/*`). Any other request falls through to the SPA — that's what `assets.not_found_handling: "single-page-application"` in `wrangler.json` does.

When running locally without a Shopify store configured, the Worker serves a sample catalog of children's ski gear with hand-written enrichments. This lets you see the full `/llms.txt` output and the SPA without needing a live store or Workers AI connection. Miniflare provisions a local KV namespace automatically, so no extra setup is needed for `npm run dev` or `npm run test`.

## How caching works

On the first request (or after the cache expires), the Worker:

1. Fetches your product catalog from Shopify (or uses the sample catalog)
2. Sends each product to Workers AI for enrichment (batched 5 at a time)
3. Stores the enriched catalog in KV
4. Serves the cached result for subsequent requests

**Cache layers:** CDN caches the response for 5 minutes (`Cache-Control: public, max-age=300`). KV caches the enriched catalog for 1 hour by default (`ENRICHMENT_CACHE_TTL`). This means inventory changes can take up to ~65 minutes to propagate. Lower the TTL values if you need faster updates.

**First-request latency:** The first request after a cache miss will be slow — Workers AI needs to enrich every product. For a 50-product catalog, expect 5-15 seconds on the first request. Subsequent requests are fast (KV read + response).

## Shopify integration notes

- **Public API only.** This template uses Shopify's public `/products.json` endpoint, which doesn't require an API key. It works with any Shopify store that hasn't disabled this endpoint.
- **Inventory is approximate.** The public API exposes variant-level availability (in stock / out of stock) but not exact inventory quantities. The `stockCount` shown in `/llms.txt` is the number of available variants, not units on hand. For exact inventory, you'd need to integrate the [Shopify Admin API](https://shopify.dev/docs/api/admin-rest).
- **Password-protected stores** are supported via the `SHOPIFY_STORE_PASSWORD` secret.
- **Large catalogs** are paginated automatically (up to 5,000 products). Be aware that very large catalogs will trigger more Workers AI calls on cache miss and may take longer on the first request.

## Known limitations

- **Workers AI cost on cache miss.** Each product requires one AI inference call for enrichment. A 250-product store triggers 250 calls (in batches of 5) on the first request. These are billed as standard [Workers AI inference requests](https://developers.cloudflare.com/workers-ai/platform/pricing/). Once cached, no AI calls are made until the cache expires.
- **No webhook-based cache invalidation.** The cache expires on a timer (default: 1 hour). If you need instant updates when products change in Shopify, you'd need to add a webhook handler that clears the KV cache — not included in this template.
- **Single-store only.** The template serves one Shopify store per Worker. For multi-store setups, deploy one Worker per store or extend the routing logic.
