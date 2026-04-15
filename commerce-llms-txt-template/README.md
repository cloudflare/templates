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

3. Create a KV namespace for caching:
   ```bash
   npx wrangler kv namespace create ENRICHMENT_CACHE
   ```
   Copy the `id` into your `wrangler.json` under `kv_namespaces`.

4. Deploy:
   ```bash
   npx wrangler deploy
   ```

Your `/llms.txt` endpoint is now live.

## Endpoints

| Endpoint | Description |
|---|---|
| `GET /llms.txt` | Agent-optimized product catalog (concise) |
| `GET /llms-full.txt` | Detailed version with specs and highlights |
| `GET /api/products` | Full enriched catalog as JSON |
| `GET /api/products/:slug` | Single product detail |
| `GET /api` | API documentation |

## Configuration

| Variable | Description | Default |
|---|---|---|
| `MERCHANT_NAME` | Your store name | `"My Store"` |
| `MERCHANT_DESCRIPTION` | Short store description | `"Product catalog powered by Commerce llms.txt"` |
| `STORE_CURRENCY` | Currency code | `"USD"` |
| `MERCHANT_VERTICAL` | Product vertical for AI enrichment | `"general retail"` |
| `SHOPIFY_STORE_DOMAIN` | Your `*.myshopify.com` domain | *(empty — uses sample catalog)* |
| `ENRICHMENT_CACHE_TTL` | Cache TTL in seconds | `"3600"` |

For password-protected Shopify stores:
```bash
npx wrangler secret put SHOPIFY_STORE_PASSWORD
```

## Development

```bash
npm run dev    # Start local dev server
npm run test   # Run tests
npm run check  # Type check + dry-run deploy
```
