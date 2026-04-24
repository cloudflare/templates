[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/agent-commerce-analytics-template)

# Agent Commerce Analytics

![Status: Demo-ready](https://img.shields.io/badge/status-demo--ready-green) ![Type: Analytics dashboard](https://img.shields.io/badge/type-analytics--dashboard-blue)

<!-- dash-content-start -->

A Cloudflare Workers template that gives merchants visibility into how AI shopping agents interact with their store. It tracks the full journey from discovery (`/llms.txt` reads) through browsing (product views) to purchase (checkout attempts), broken down by agent identity, payment network, and verification status, and ships with a React dashboard that surfaces auto-generated insights (top agents, blocked checkouts, product gaps, content quality, revenue headlines). Seeded with bundled demo traffic so the dashboard is populated on first deploy.

<!-- dash-content-end -->

## The Problem

Today, Cloudflare Radar tells a merchant: "You got AI bot traffic."
Zone Analytics tells them: "These paths were hit."

Nobody tells them: "An agent searched for toddler skis, found the Little Rippers, and bought three items for $199.97."

## What This Does

The analytics Worker collects commerce-specific signals — `/llms.txt` reads, search queries, verified agent identity, checkout attempts — then generates a merchant dashboard with:

- **Auto-generated insights** — top agents, blocked checkouts, product gaps, content quality, revenue headlines — all computed from data, not hardcoded
- **Agent journey timelines** — per-agent session reconstruction showing discover -> browse -> purchase -> return, with timestamps and return visit detection
- **Revenue with dollar amounts** — estimated revenue per agent, per payment network, average order value, verified vs. unverified split
- **Visual discovery funnel** — ASCII bar chart showing /llms.txt reads -> product views -> checkout attempts -> successful/blocked split
- **Security & trust** — verified/unverified agent ratio, blocked checkout rate, flagged unverified agents
- **Demand signals** — search query -> outcome mapping: which queries converted, which bounced, which had no matching product (product gap detection)
- **Content quality signals** — is the concise /llms.txt sufficient, or do agents need /llms-full.txt?
- **Product performance** — per-product conversion rates, estimated revenue, "viewed but didn't purchase" attribution
- **"What this unlocks" comparison** — side-by-side of current Cloudflare analytics vs. what this dashboard surfaces

## Architecture

```
Discovery signals           Trust signals
(/llms.txt reads,           (agent identity,
 search queries)             checkout intent)
        \                      /
         v                    v
    Agent Commerce Analytics Worker
    Collects events, computes aggregations,
    auto-generates insights from data
              |
              v
    Merchant Dashboard
    "Here's what agents did in your store"
```

## Endpoints

| Endpoint                    | Description                           |
| --------------------------- | ------------------------------------- |
| `POST /events`              | Record a single agent event           |
| `POST /events/batch`        | Record multiple events                |
| `POST /events/from-headers` | Record event from cf-agent-\* headers |
| `GET /dashboard`            | Full analytics summary (JSON)         |
| `GET /dashboard/text`       | Analytics summary (human-readable)    |
| `GET /dashboard/funnel`     | Discovery-to-purchase funnel          |
| `GET /dashboard/agents`     | Agent profiles                        |
| `GET /dashboard/products`   | Product performance                   |

## Quick Start

Deploy straight from the button above, or run locally:

```bash
npm install
npm run dev        # Start the Worker + React dashboard locally
```

Other commands:

```bash
npm run build      # Type-check and build the React app
npm run deploy     # Build and deploy to Cloudflare Workers
npm test           # Run the Vitest suite
```

On first request the Worker seeds bundled demo traffic (5 agents, 19 interactions) so the dashboard is populated out of the box. Set the `SEED_DEMO_DATA` binding to `false` once you're ingesting real events.

## Simulated Agents

The bundled demo traffic includes 5 agents with 19 interactions:

| Agent          | Network               | Behavior                                                                                  |
| -------------- | --------------------- | ----------------------------------------------------------------------------------------- |
| **BuyBot**     | Visa (verified)       | The ski trip: searched, browsed 3 products, bought all 3 ($199.97), came back for goggles |
| **ShopAssist** | Mastercard (verified) | Comparison shopper: needed /llms-full.txt, viewed skis, didn't buy                        |
| **PriceScout** | Unverified            | Searched "cheapest toddler skis", tried checkout — BLOCKED                                |
| **GearFinder** | Visa (verified)       | Browsed hiking + running, bought trail runners ($129.99)                                  |
| **DealHunter** | Mastercard (verified) | Searched "snowboard toddler", left — product gap signal                                   |

## Sample Dashboard Output

```
TODAY: 5 agents made 19 requests. 2 purchased ($329.96 est. revenue).
       1 unverified checkout blocked. 1 search for products you don't carry.
       Top agent: BuyBot Shopping Agent (Visa) — 3 items, $199.97

INSIGHTS
  [$$] Revenue: Est. $329.96 from agent commerce
  [>>] Top agent: BuyBot Shopping Agent — 3 checkouts, est. $199.97
  [<>] Repeat visitor: BuyBot returned searching "toddler ski goggles"
  [!!] Blocked: PriceScout checkout denied (unverified)
  [??] Product gap: "snowboard toddler" — no matching product
  [##] Top product: Little Ripper Ski Package — 33% conversion
  [OK] Content working: 80% of agents needed only concise /llms.txt
```

## How this fits

This template is the **visibility layer** of a broader exploration of agent commerce on Cloudflare — the loop where agents discover a merchant's catalog (e.g. via `/llms.txt`), get verified at the edge, and convert intent into checkout. Those other layers are out of scope for this template; this one stands on its own and can ingest events from any source that POSTs to `/events` or forwards `cf-agent-*` headers.

A merchant running no other piece of that loop can still benefit from a commerce-specific analytics surface. It's stronger when composed with the rest: discovery events (`/llms.txt` reads, search queries), verified-agent signals from an edge ruleset, and demand patterns from an agent orchestrator all flow through the same event pipeline.
