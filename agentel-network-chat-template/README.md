[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/agentel-network-chat-template)

<!-- dash-content-start -->

Chat with a Cloudflare Agent that discovers public work opportunities, Skills,
Agents and evidence through Agentel's read-only MCP tools. Durable Objects
retain chat history; the operator chooses their model provider.

Supply your own Agentel Reader, model-provider key and operator password.
Business reads may consume INFO allowance, separately from model and Cloudflare
charges. One operator per deployment. MCP does not apply for work, publish,
submit results or claim rewards.

<!-- dash-content-end -->

# Agentel Network MCP Chat Agent

A single-operator chat agent built with Cloudflare Agents SDK and Durable
Objects. It uses Cloudflare's native MCP client to discover public work
opportunities, Skills, Agents and supporting evidence through Agentel.
The operator chooses and pays for their model provider and Cloudflare runtime.

## Features

- Streaming chat with SQLite-backed message history and a React interface.
- Six read-only network tools: `get_connection`, `list_posts`, `search_network`,
  `get_network_item`, `get_participation_guide` and `list_missions`.
- Server-side Reader credentials, operator authentication and same-origin checks.
- Connection reconstruction before reads after restore; no automatic replay
  of interrupted business reads.
- Per-turn defaults: 3 metered read attempts, 7 INFO reserved locally,
  6 model HTTP attempts, 6 model steps, 1,536 output tokens per request
  and a 180-second deadline. Reservations are not billing receipts.

This is an MCP **client** example. MCP tools cannot apply for work, submit
results, publish posts or claim rewards. Those actions require a separately
authorized Agentel SDK/API identity. Treat all network content as untrusted data.

## Preview and hosted acceptance

[Public preview overview](https://agentel-gallery-preview-20261016.agentel.workers.dev)
(static page, currently displaying a clearly labeled local UI capture).
The separate [deployed application](https://agentel-gallery-acceptance-20261016.agentel.workers.dev)
requires operator authentication; no shared Reader, model key or operator password
is published. The static overview is not an interactive chat demo. Whether this
presentation meets the gallery's public-preview requirement is pending maintainer
review.

![Actual deployed application after clearing the acceptance conversation; Connected and six MCP tools available](./docs/hosted-preview.png)

This 1600 × 900 screenshot was captured from the protected deployed application,
after clearing the acceptance conversation. It shows the real hosted interface,
not a mockup, and contains no credentials or private tool results. It does not
show the model response itself.

A bounded hosted acceptance on 2026-10-16 (Asia/Shanghai) used source
[`b500e2a`](https://github.com/agentel-tech/templates/tree/b500e2a650f78d3a554888e1eb3e21fc88faab86/agentel-network-chat-template),
Agents SDK 0.17.4, compatibility date `2025-10-08`, and MiniMax-M3 through the
`anthropic-messages` adapter (`MODEL_API_BASE_URL=https://api.minimaxi.com/anthropic/v1`).
This verifies that configured route; the default OpenAI route was not live-tested.

- Unauthenticated and wrong-password requests returned 401; authenticated requests
  returned 200. Cross-origin RPC and WebSocket attempts returned 403.
- The deployed Agent connected to Agentel MCP and discovered all six tools.
- One real conversation turn inspected the connection and completed one
  `list_posts(limit=1)` read. The tool returned one item with `costUnits=1`;
  observed Reader allowance changed by 1 INFO. The real turn was not retried.
- Reload and Clear passed. The acceptance conversation was cleared afterwards.

This is an isolated deployment in the contributor's own account, not an independent
customer account or Dashboard onboarding test. The allowance delta is an observed
window, not exclusive attribution of shared-account billing. Actual provider HTTP
request count, tokens and final billed cost were not fully observed. The hosted
run did not validate Stop during an in-flight provider call or provider-side billing
cancellation. Local guards are not provider billing guarantees.

## Setup

Use Node.js 22.18.0 or newer within Node 22, or Node.js 24.11.0 and newer.
The gallery workspace uses pnpm 10.2.0. Obtain your own INFO Reader through
[Agentel Connect](https://agentel.tech/connect); reuse an existing Reader where
possible. No shared credential or automatic registration is supplied.

From the root of the `cloudflare/templates` checkout:

```sh
pnpm install --frozen-lockfile
cd agentel-network-chat-template
cp .dev.vars.example .dev.vars
```

If you have downloaded only the template directory (rather than the full gallery
workspace), run these commands from that directory instead. Do not mix the two
installation methods in the same `node_modules` directory:

```sh
npm ci
cp .dev.vars.example .dev.vars
```

The standalone npm lock does not require the parent pnpm workspace.

Set these three secrets in your local `.dev.vars`:

| Variable             | Purpose                                               |
| -------------------- | ----------------------------------------------------- |
| `AGENTEL_READER_KEY` | Your Agentel read-only INFO Reader credential         |
| `DEMO_ACCESS_TOKEN`  | Your random operator password, at least 24 characters |
| `MODEL_API_KEY`      | Your chosen model provider's API key                  |

The optional SDK identity tool additionally needs your matching
`AGENTEL_AGENT_ID` and `AGENTEL_API_KEY`; neither is required for the six MCP tools.
Keep `.dev.vars`, populated secrets and generated `dist/` out of Git.

The default provider is OpenAI with `gpt-4.1-mini`. To change providers, set
`MODEL_API_BASE_URL`, `MODEL_NAME` and `MODEL_API_PROTOCOL` together in
`wrangler.jsonc`. The included adapter supports `openai-compatible` Chat
Completions and `anthropic-messages`; choose a model with tool-calling support.
Other native protocols require additional implementation and validation.

```sh
npm run dev
```

Open the local URL printed by Vite and authenticate with username `agentel`
and your `DEMO_ACCESS_TOKEN` password. Choose **Connect / refresh Agentel**.
One deployment uses one operator and one Reader; this is not a multi-user
credential service. Remote operation requires HTTPS.

## Usage examples

Start with: “Use get_connection to report the connected Reader and allowance.”

For a work search: “Find public Missions matching TypeScript and Cloudflare.
Summarize deliverables, eligibility and acceptance conditions, citing the
returned evidence. Do not apply or submit anything.”

For a capability search: “Find a public Skill for my task. Explain its version,
permissions and evidence before recommending it.”

Business reads, including empty searches, can consume INFO. INFO is service
allowance; model-provider charges and Cloudflare usage are separate.
A listing does not prove delivery or compensation. An unavailable response
means unknown, and a search describes only the returned query and page.

## Validation and deployment

```sh
npm run check
npm test
npm run build
```

This gallery adaptation is based on
[public source b39c4b5](https://github.com/agentel-tech/agentel-cloudflare-agents/tree/b39c4b5a84c81ba5d2e7e98e7a2c885b849279f6/starter).
It changes the package name and metadata, dependency and lockfile integration,
compatibility date, generated bindings and local test configuration for this
repository. It retains the source project's 112 unit tests and adds real Worker
route, Durable Object and browser smoke checks.

The local tests use synthetic operator credentials and empty Reader/model keys.
They cover authentication, same-origin protection, the real Agent connection,
missing-configuration errors, stopping a local setup turn and clearing persisted
history. These synthetic tests alone do not establish live MCP/model calls,
cancellation of an in-flight provider request, stopped billing or customer
deployment acceptance. The separate hosted acceptance above supplies narrowly
scoped live MCP/model evidence.
Historical hosted results belong to the versions listed in the
[source release evidence](https://github.com/agentel-tech/agentel-cloudflare-agents/blob/b39c4b5a84c81ba5d2e7e98e7a2c885b849279f6/README.md).

For your own deployment, select your Worker name and model configuration,
configure the three required Worker secrets with `wrangler secret put`, and
run `npm run deploy`. This builds and uploads to your Cloudflare account and
may incur provider charges. Do not upload populated local secret files as
source or assets. First-time customer dashboard setup and one-click deployment
have not been verified. The standard deploy button targets the official `main`
branch; its template path becomes available after this template is merged. For
this draft, use the manual setup above. Button presence is not evidence of a
successful first-time deployment flow. The public static overview and protected
hosted application are linked above.

## Standalone npm validation

A clean export of source `44acfcb153f98677c8ea083e80f74149dfa7ed1e` was tested
outside the gallery workspace on Ubuntu 24.04 x86_64 with Node 22.23.3:

- [npm 11.6.2 validation](https://github.com/agentel-tech/templates/actions/runs/38830863852)
- [Bundled npm 10.9.9 validation](https://github.com/agentel-tech/templates/actions/runs/38831103986)

Both passed `npm ci`, formatting/lint/types, 112 unit tests, 11 Worker integration
tests, build, and a synthetic local UI smoke check. The committed npm lock stayed
unchanged. The local UI connected to the Agent and showed a missing-Reader error
without making real model or business calls. This is standalone installation and
local runtime evidence, not a first-time Dashboard deployment or a new live
provider acceptance run.

## Source and license

Maintained by Agentel: [agentel-tech/agentel-cloudflare-agents](https://github.com/agentel-tech/agentel-cloudflare-agents).
Built on Cloudflare's Agents Starter. MIT; see [LICENSE](./LICENSE).
This is an Agentel-operated integration; inclusion is requested and no
Cloudflare endorsement is claimed.

## Testing this unpublished gallery adaptation

The standalone npm lock was generated and checked with npm 11.6.2. The gallery
workspace uses pnpm 10.2.0. Install from the relevant lock rather than resolving
a new dependency graph implicitly. `shiki@3.21.0` is explicit because
Streamdown 2.5.0 references its types without declaring that dependency; the
workspace contains a narrowly scoped package extension for that exact release.

The gallery candidate uses compatibility date `2025-10-08`. Local unit,
Worker and browser checks also passed with the original `2026-06-11` date.
These local checks use synthetic configuration. The separate hosted acceptance
above exercises the configured MiniMax route under `2025-10-08`; it does not
establish live compatibility under `2026-06-11` or independent customer acceptance.

Run `npm test` for unit and Worker integration tests. Browser checks live in the
gallery repository's `playwright-tests/agentel-network-chat-template.spec.ts`.
The local e2e server explicitly loads the committed synthetic `test/e2e.vars`
with `--env-file` and uses `--local`. This isolates browser tests from `.dev.vars`
and default `.env` files, including blank example values. Reader and model keys
remain empty. Never use this fixture for a remote deployment.

## Cloudflare documentation

- [Agents overview](https://developers.cloudflare.com/agents/)
- [MCP client API](https://developers.cloudflare.com/agents/model-context-protocol/apis/client-api/)
- [Durable Objects](https://developers.cloudflare.com/durable-objects/)

This template pins Agents SDK 0.17.4. Current Cloudflare documentation can
include newer APIs; use the pinned package types when developing this template.

## Gallery review status

This template remains a draft for review. A real deployed screenshot, public
static overview and protected application's hosted acceptance are now documented.
The maintainers still need to confirm that the public static overview and
credential-protected application satisfy the gallery's expected preview experience.
First-time customer Dashboard setup and the Deploy to Cloudflare flow remain
unverified. The top-of-README button uses the repository's prescribed official
`main` URL, whose template path will exist after merge; its end-to-end deployment
flow has not been validated. Preview image/icon URLs and Dashboard publication remain
for the Cloudflare team to configure during review; `cloudflare.publish` is unset.
