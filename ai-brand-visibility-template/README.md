[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/ai-brand-visibility-template)

# AI Brand Visibility Template

<!-- dash-content-start -->

Test whether AI models mention your brand when answering relevant queries. Runs prompts through GPT-5.4, Claude Sonnet 4, Gemini 3 Flash, Llama 4, and Mistral — all through Cloudflare AI Gateway. No API keys needed.

## What it does

- **Multi-site monitoring** — Add multiple domains, each with their own prompts and model configs
- **5 AI models** — OpenAI GPT-5.4 Nano, Anthropic Claude Sonnet 4, Google Gemini 3 Flash, Meta Llama 4 Scout, Mistral Small 3.1
- **AI prompt generation** — Workers AI analyzes your site and suggests relevant test prompts
- **Parallel execution** — Cloudflare Queues fan out model × prompt jobs for fast results
- **Real-time progress** — Poll-based UI shows results as they complete
- **CSV export** — Download results filtered by model or prompt
- **SSR** — React Router 7 + Hono on Cloudflare Workers, server-rendered

<!-- dash-content-end -->

## Prerequisites

1. **Cloudflare account** — [Sign up](https://dash.cloudflare.com/sign-up)
2. **Unified Billing credits** — Third-party models (OpenAI, Anthropic, Google) are billed through [AI Gateway Unified Billing](https://developers.cloudflare.com/ai-gateway/features/unified-billing/). Load credits in the [Cloudflare dashboard](https://dash.cloudflare.com/?to=/:account/ai/ai-gateway).
3. **Node.js >= 22** — Required for Wrangler

> Workers AI models (`@cf/` prefix) use standard [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) and do not require Unified Billing credits.

## Setup

```bash
git clone https://github.com/cloudflare/ai-brand-visibility-template
cd ai-brand-visibility-template
npm install

npx wrangler login
npx wrangler kv namespace create AEO_KV       # Replace the example ID in wrangler.jsonc
npx wrangler queues create brand-visibility-jobs

npm run deploy
```

## Development

```bash
npm run dev      # Local dev server with hot reload
npm run build    # Production build
npm run deploy   # Build + deploy to Cloudflare
```

## Architecture

```
workers/
  app.ts          — Hono entry: API routes + React Router SSR + Queue consumer
  api.ts          — All /api/* endpoints
  queue.ts        — Queue consumer for parallel model inference
app/
  routes/
    layout.tsx    — Dashboard shell (header + sidebar)
    results.tsx   — Results + filters + pagination (index page)
    prompts.tsx   — Prompt management + AI generation
    models.tsx    — Model selection per site
    setup.tsx     — Wizard: site → competitors → prompts → models
  components/     — UI components (Cloudflare dashboard style)
src/
  config.ts       — Model definitions, settings
```

## Models

All models run through `env.AI.run()` with AI Gateway. No provider API keys required.

| Model             | Provider             | Billing            |
| ----------------- | -------------------- | ------------------ |
| GPT-5.4 Nano      | OpenAI               | Unified Billing    |
| Claude Sonnet 4   | Anthropic            | Unified Billing    |
| Gemini 3 Flash    | Google               | Unified Billing    |
| Llama 4 Scout 17B | Meta (Workers AI)    | Workers AI pricing |
| Mistral Small 3.1 | Mistral (Workers AI) | Workers AI pricing |

## Cost

Each test runs 5 models × N prompts. With 5 prompts, that's 25 inference calls per test.

- **GPT-5.4 Nano** — Cheapest OpenAI option, optimized for edge
- **Claude Sonnet 4** — Mid-tier Anthropic pricing
- **Gemini 3 Flash** — Google's fast/cheap option
- **Workers AI models** — Usage-based, see [pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)

Check [AI Gateway pricing](https://dash.cloudflare.com/?to=/:account/ai/ai-gateway) for current rates.

## License

MIT
