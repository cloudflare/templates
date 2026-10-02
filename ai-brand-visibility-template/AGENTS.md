# Brand Visibility Tester — Setup Guide for AI Agents

## What is this?

A Worker template that tests whether AI models (GPT-5.4, Claude Sonnet 4, Gemini 3 Flash, Llama 4, Mistral) mention your brand when answering relevant queries. All models run through Cloudflare AI Gateway — no external API keys needed.

## Prerequisites

1. Cloudflare account with Workers AI access
2. **Unified Billing credits loaded** for third-party models (OpenAI, Anthropic, Google). Load at: https://dash.cloudflare.com → AI Gateway → Billing
3. Node.js >= 22

## Quick Setup

```bash
npm install
npx wrangler login
npx wrangler kv namespace create AEO_KV   # Replace the example ID in wrangler.jsonc
npx wrangler queues create brand-visibility-jobs
npm run deploy
```

## Setup Flow

1. **Enter site** — domain to monitor
2. **Brand & competitors** — confirm brand name, optionally add competitors
3. **Prompts** — generate AI suggestions or add custom prompts
4. **Models** — select which of the 5 models to test
5. **Run** — queues fan out jobs in parallel, results stream in

## API

| Endpoint                     | Method          | Description                |
| ---------------------------- | --------------- | -------------------------- |
| `/api/sites`                 | GET/POST/DELETE | Site CRUD                  |
| `/api/sites/:domain/prompts` | GET/POST/DELETE | Prompt CRUD                |
| `/api/sites/:domain/models`  | GET/PUT         | Model selection            |
| `/api/sites/:domain/test`    | POST            | Start test (enqueues jobs) |
| `/api/tests/:id/status`      | GET             | Poll test progress         |
| `/api/setup?domain=X`        | GET             | AI prompt generation       |
| `/api/models`                | GET             | List available models      |
| `/api/results/:id`           | GET             | Get test result            |
| `/api/results/:id/csv`       | GET             | Download CSV               |

## Files

| File               | Purpose                             |
| ------------------ | ----------------------------------- |
| `src/config.ts`    | Model definitions, settings         |
| `workers/app.ts`   | Hono entry + SSR + Queue consumer   |
| `workers/api.ts`   | All API endpoints                   |
| `workers/queue.ts` | Queue consumer (parallel inference) |
| `app/routes/`      | React Router pages                  |
| `app/components/`  | Kumo-matched UI components          |
