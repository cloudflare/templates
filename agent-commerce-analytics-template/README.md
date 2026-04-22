# Agent Commerce Analytics

![Status: Demo-ready](https://img.shields.io/badge/status-demo--ready-green) ![Type: Analytics dashboard](https://img.shields.io/badge/type-analytics--dashboard-blue)

**Part of the [agent-commerce](https://gitlab.cfdata.org/mconroy/agent-commerce) portfolio** — the visibility layer that stands on its own and composes with the rest.

**Live dashboard:** https://agent-commerce-analytics.mattrc07.workers.dev/dashboard/text _(public)_

A Cloudflare Workers prototype that gives merchants visibility into how AI shopping agents interact with their store. Tracks the full journey from discovery (/llms.txt reads) through browsing (product views) to purchase (checkout attempts), broken down by agent identity, payment network, and verification status.

## The Problem

Today, Cloudflare Radar tells a merchant: "You got AI bot traffic."
Zone Analytics tells them: "These paths were hit."

Nobody tells them: "An agent searched for toddler skis, found the Little Rippers, and bought three items for $199.97."

## What This Does

The analytics Worker collects commerce-specific signals from Demo 1 (llms.txt reads, search queries) and Demo 2 (verified agent identity, checkout attempts), then generates a merchant dashboard with:

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
Demo 1 signals              Demo 2 signals
(llms.txt reads,            (agent identity,
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

```bash
npm install
npm run walkthrough    # Full self-contained demo (recommended)
```

### Other Commands

```bash
npm run dev            # Start the Worker locally on :8787
npm run simulate       # Simulate agent traffic (Worker must be running)
npm run dashboard      # Code walkthrough + simulation
```

## Simulated Agents

The demo simulates 5 agents with 19 interactions:

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

This dashboard is the **visibility layer** of the [agent-commerce portfolio](https://gitlab.cfdata.org/mconroy/agent-commerce) — a set of six prototypes that together explore what commerce looks like when the shopper is an AI agent:

| Layer                      | Component                                                                                        | What it does                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Discovery (supply)         | [commerce-llms-txt](https://gitlab.cfdata.org/mconroy/commerce-llms-txt)                         | Serves agent-readable product catalogs as `/llms.txt`             |
| Discovery (distribution)   | [commerce-llms-txt-shopify-app](https://gitlab.cfdata.org/mconroy/commerce-llms-txt-shopify-app) | One-click install that brings `/llms.txt` to any Shopify merchant |
| Trust                      | [agent-commerce-ruleset](https://gitlab.cfdata.org/mconroy/agent-commerce-ruleset)               | Verifies signed agent requests at the Cloudflare edge             |
| Demand                     | [outcome-shopping](https://gitlab.cfdata.org/mconroy/outcome-shopping)                           | Multi-merchant orchestrator for outcome-level intents             |
| **Visibility (this repo)** | **agent-commerce-analytics**                                                                     | **Merchant dashboard for agent traffic**                          |
| B2B bet                    | [agent-commerce-b2b](https://gitlab.cfdata.org/mconroy/agent-commerce-b2b)                       | The same loop for B2B procurement                                 |

### What we built

This started as "Demo 3 of 3" — a minimal merchant-facing view paired with the discovery and trust prototypes. It's been extended to include auto-generated insights, per-agent session reconstruction, revenue attribution, and demand signals (which queries had no matching product, whether the concise `/llms.txt` is sufficient or agents are falling back to `/llms-full.txt`).

It stands on its own — a merchant running no other piece of this portfolio can still benefit from a commerce-specific analytics surface. It's stronger when composed with the rest: real discovery events from `commerce-llms-txt`, verified-agent signals from `agent-commerce-ruleset`, and demand patterns from `outcome-shopping` all flow through the same event pipeline.
