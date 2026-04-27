# Outcome Shopping Orchestrator

![Status: Demo-ready](https://img.shields.io/badge/status-demo--ready-green) ![Type: Agent orchestrator](https://img.shields.io/badge/type-agent--orchestrator-blueviolet)

**Part of the [agent-commerce](https://gitlab.cfdata.org/mconroy/agent-commerce) portfolio** — the demand-side orchestration layer.

**Live demo:** https://outcome-shopping.chambers-testing-7ff.workers.dev/shop _(Cloudflare SSO)_

Multi-vendor, outcome-based shopping powered by [commerce llms.txt](https://gitlab.cfdata.org/mconroy/commerce-llms-txt). Describe what you want to achieve and this agent decomposes your intent into component needs, searches across multiple merchants' AI-enriched catalogs, and assembles a cross-merchant recommendation.

## What it demonstrates

This is a proof of concept for **outcome-based agent commerce** — the idea that agents should shop by intent ("outfit my 3-year-old for skiing"), not by product search ("toddler ski set size 70cm").

The key insight: **each merchant's commerce llms.txt becomes more valuable as more merchants adopt it**, because agents can compose across them. A single merchant's catalog solves discovery. Multiple merchants' catalogs solve outcomes.

### How it works

```
"outfit my 3-year-old for skiing"
        ↓
┌─────────────────────────────┐
│  Intent Decomposition       │  Workers AI (Llama 3.1 8B)
│  → skis, boots, helmet,    │  Breaks intent into 5-8
│    jacket, pants, gloves,   │  component product needs
│    base layers, socks       │
└─────────────────────────────┘
        ↓
┌─────────────────────────────┐
│  Catalog Aggregation        │  Fetches /api/products from
│  → 9 products across        │  each registered merchant's
│    3 merchants              │  commerce llms.txt Worker
└─────────────────────────────┘
        ↓
┌─────────────────────────────┐
│  Per-Need Matching          │  Workers AI (Llama 3.1 8B)
│  → Best product per need    │  One AI call per need for
│    from any merchant,       │  accuracy; tracks used
│    with alternatives        │  products for variety
└─────────────────────────────┘
        ↓
  Cross-merchant recommendation
  with total cost and sourcing
```

### Architecture

- **Runtime:** Cloudflare Workers (Hono framework)
- **AI:** Workers AI binding (`@cf/meta/llama-3.1-8b-instruct`)
- **Caching:** KV namespace for aggregated merchant catalogs (5 min TTL)
- **Merchant data:** Each merchant runs a [commerce-llms-txt](https://gitlab.cfdata.org/mconroy/commerce-llms-txt) Worker that serves AI-enriched product data

## Endpoints

| Endpoint                   | Description                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `GET /shop?q=<intent>`     | Human-friendly UI with loading states and styled results                               |
| `GET /api/shop?q=<intent>` | JSON API for agents — returns decomposition, recommendations, alternatives, total cost |
| `GET /llms.txt`            | Agent-readable capability description of this orchestrator                             |
| `GET /api/catalogs`        | Aggregated multi-merchant catalog (JSON)                                               |
| `GET /api/merchants`       | Registered merchants and their connectivity status                                     |
| `GET /`                    | Service discovery (JSON)                                                               |

## Project structure

```
src/
├── index.ts                 # Hono app, routes, HTML rendering
├── ai/
│   ├── decompose.ts         # Intent → component needs (Workers AI)
│   └── match.ts             # Needs × products → recommendations (Workers AI)
└── lib/
    ├── types.ts             # TypeScript interfaces
    ├── catalog.ts           # Merchant catalog fetching and aggregation
    └── sample-catalogs.ts   # Demo data (3 merchants, 9 products)
```

## Setup

```bash
npm install
```

### Local development

```bash
npm run dev
```

Note: The AI binding requires `--remote` mode or a deployed Worker. Local dev without remote bindings will fail on AI calls.

### Configuration

All config is in `wrangler.jsonc`:

| Variable             | Description                                                             |
| -------------------- | ----------------------------------------------------------------------- |
| `MERCHANT_ENDPOINTS` | JSON array of `{name, url}` merchant endpoints                          |
| `AI_MODEL`           | Workers AI model identifier (default: `@cf/meta/llama-3.1-8b-instruct`) |
| `CACHE_TTL`          | Catalog cache TTL in seconds (default: 300)                             |

### Deploy

```bash
npm run deploy
```

## Current status

This is a working prototype using sample catalog data from 3 simulated merchants (Summit Sprouts, Peak Riders Gear Co., Snow Bunny Kids). When real merchant endpoints are available on the public internet, update `MERCHANT_ENDPOINTS` in `wrangler.jsonc` and the sample data fallback will be bypassed automatically.

### Known limitations

- **Sample data fallback:** When all merchant fetches fail (e.g., behind Cloudflare Access), demo data is served. There's no visible indicator to the user.
- **Model quality:** Llama 3.1 8B occasionally confuses product indices. A relevance-score validation step catches most of these, but alternatives can still be slightly off.
- **Sequential matching:** Per-need AI calls add 1-4s latency. This is a deliberate tradeoff for accuracy over the batch approach.
- **No test coverage:** The AI response parsing logic is the most fragile surface and would benefit from unit tests.

## Relationship to commerce llms.txt

This project is the **demand-side counterpart** to [commerce-llms-txt](https://gitlab.cfdata.org/mconroy/commerce-llms-txt) (supply side). Commerce llms.txt makes a single merchant's catalog agent-readable. This orchestrator composes across multiple merchants' catalogs to fulfill outcome-based intents that no single merchant can satisfy alone.

The strategic thesis: the more merchants that deploy commerce llms.txt, the more useful this orchestration layer becomes. That's the network effect story for merchant adoption.
