# Commerce llms.txt

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/commerce-llms-txt-template)

<!-- dash-content-start -->

Make your product catalog visible to AI shopping agents. This template serves a dynamic `/llms.txt` endpoint that uses [Workers AI](https://developers.cloudflare.com/workers-ai/) to transform raw product specs into natural language descriptions agents can reason with.

**How it works:** Connect your Shopify store (or use the included sample catalog), and the Worker enriches each product's technical specifications into agent-friendly summaries, use-case tags, and buyer highlights. The enriched catalog is cached in [KV](https://developers.cloudflare.com/kv/) and served as a structured `/llms.txt` endpoint that any AI agent can consume in a single request.

**Key features:**
- Dynamic `/llms.txt` and `/llms-full.txt` endpoints following the [llms.txt spec](https://llmstxt.org)
- AI enrichment powered by Workers AI (Llama 3.1 8B) — turns "DIN 0.75-3.0" into "bindings release easily for toddler safety"
- KV-backed caching with configurable TTL — no re-enrichment on cold starts
- Shopify integration via public `/products.json` API
- Configurable merchant vertical to tailor AI descriptions per industry
- JSON API for programmatic access (`/api/products`, `/api/products/:slug`)

<!-- dash-content-end -->

## Who is this for

- **Merchants who want AI agents to recommend their products.** If you sell on Shopify and want ChatGPT, Perplexity, or other AI shopping agents to understand your catalog, this gives them a structured endpoint to consume.
- **Developers building AI shopping experiences.** If you're building an agent that recommends products, this is the merchant-side counterpart — a standardized, enriched product feed your agent can consume in one request.
- **Platform teams exploring agentic commerce.** If you're evaluating how to make product data agent-readable across a portfolio of stores, this template is a working starting point.

## Getting Started

Outside of this repo, you can start a new project with this template using [C3](https://developers.cloudflare.com/pages/get-started/c3/) (the `create-cloudflare` CLI):

```bash
npm create cloudflare@latest -- --template=cloudflare/templates/commerce-llms-txt-template
```

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure your store in `wrangler.json` — set `MERCHANT_NAME`, `MERCHANT_DESCRIPTION`, and optionally `SHOPIFY_STORE_DOMAIN`:
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

3. Create a KV namespace for caching and update `wrangler.json`:
   ```bash
   npx wrangler kv namespace create ENRICHMENT_CACHE
   ```
   This outputs a namespace ID. Replace `"PLACEHOLDER"` in the `kv_namespaces` section of `wrangler.json` with it:
   ```json
   {
     "kv_namespaces": [
       {
         "binding": "ENRICHMENT_CACHE",
         "id": "your-namespace-id-here"
       }
     ]
   }
   ```

4. Deploy:
   ```bash
   npx wrangler deploy
   ```

Your `/llms.txt` endpoint is now live at `https://commerce-llms-txt-template.<your-subdomain>.workers.dev/llms.txt`.

## After Deploy

Once deployed, your Worker serves an agent-readable product catalog. Here's how to put it to use:

**Point your domain at it.** Add a [Custom Domain](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) or [Route](https://developers.cloudflare.com/workers/configuration/routing/routes/) so `/llms.txt` is served from your store's actual domain (e.g., `yourstore.com/llms.txt`). AI agents and crawlers will discover it the same way they find `robots.txt`.

**Test it with an agent.** Try asking ChatGPT or another AI assistant: "What products does [your store URL] sell?" If the agent supports web browsing, it can fetch your `/llms.txt` and reason about your catalog directly.

**Monitor usage.** Use `npx wrangler tail` or the [Workers dashboard](https://dash.cloudflare.com/) to see requests to your `/llms.txt` endpoint and which agents are consuming it.

## Endpoints

| Endpoint | Description |
|---|---|
| `GET /llms.txt` | Agent-optimized product catalog (concise) |
| `GET /llms-full.txt` | Detailed version with specs and highlights |
| `GET /api/products` | Full enriched catalog as JSON |
| `GET /api/products/:slug` | Single product detail |
| `GET /api` | API documentation |

## Configuration

Set these in the `vars` section of `wrangler.json`:

| Variable | Description | Default |
|---|---|---|
| `MERCHANT_NAME` | Your store name | `"My Store"` |
| `MERCHANT_DESCRIPTION` | Short store description for the llms.txt header | `"Product catalog powered by Commerce llms.txt"` |
| `STORE_CURRENCY` | Currency code | `"USD"` |
| `SHIPPING_POLICY` | Shipping policy (shown in llms.txt header) | *(empty)* |
| `RETURN_POLICY` | Return policy (shown in llms.txt header) | *(empty)* |
| `MERCHANT_VERTICAL` | Your product vertical — guides how AI describes products (e.g., `"outdoor gear"`, `"electronics"`, `"fashion"`) | `"general retail"` |
| `SHOPIFY_STORE_DOMAIN` | Your `*.myshopify.com` domain | *(empty — uses sample catalog)* |
| `ENRICHMENT_CACHE_TTL` | How long enriched products are cached, in seconds | `"3600"` |

### Secrets

For password-protected Shopify stores:
```bash
npx wrangler secret put SHOPIFY_STORE_PASSWORD
```

## Development

```bash
npm run dev    # Start local dev server on :8787
npm run test   # Run vitest tests
npm run check  # Type check + dry-run deploy
```

When running locally without a Shopify store configured, the Worker serves a sample catalog of children's ski gear with hand-written enrichments. This lets you see the full `/llms.txt` output without needing a live store or Workers AI connection.
