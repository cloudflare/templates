# SaaS Admin Template

A SaaS admin dashboard for managing customers and subscriptions, built with Astro, React, and Cloudflare Workers. Features a D1-backed REST API with Bearer token auth, interactive data tables (TanStack Table), CRUD forms (react-hook-form + Zod), a Cloudflare Workflow for background customer processing, and shadcn/ui components styled with Tailwind CSS.

## Setup

Prerequisites: Node.js >= 22.

```bash
npm install
cp .dev.vars.example .dev.vars
# Edit .dev.vars and set API_TOKEN=<your-token>
npm run dev
```

The `dev` script runs D1 migrations, builds Astro, copies the workflow wrapper, and starts Wrangler.

## Configuration

| Name                | Type     | Required | Description                                                                    |
| ------------------- | -------- | -------- | ------------------------------------------------------------------------------ |
| `DB`                | D1       | Yes      | D1 database named `admin-db`                                                   |
| `CUSTOMER_WORKFLOW` | Workflow | Yes      | Bound to `CustomerWorkflow` class                                              |
| `API_TOKEN`         | Secret   | Yes      | Bearer token for API auth. `.dev.vars` locally, `wrangler secret put` for prod |

To create the D1 database for your own account: `npx wrangler d1 create admin-db`, then update `database_id` in `wrangler.jsonc`.

## Development

Astro pages under `src/pages/` query D1 directly via service classes (`src/lib/services/`) during SSR. API routes under `src/pages/api/` require Bearer token auth validated with `crypto.subtle.timingSafeEqual` (three header formats accepted: `Authorization: Bearer`, `Authorization: Token`, `X-Api-Token`).

Interactive React components use `client:only="react"` and call the API via client-side fetch helpers in `src/lib/api.ts`.

The `CustomerWorkflow` class (`src/workflows/customer_workflow.ts`) extends `WorkflowEntrypoint` and is triggered via `POST /api/customers/:id/workflow`.

Build quirk: Astro's build doesn't export non-Astro entry points. A `wrapper.js` re-exports both the Astro app and the `CustomerWorkflow` class — the `wrangler:wrapper` script copies it over Astro's output before deploy.

Database schema is defined in three migration files under `migrations/` (customers, subscriptions/features, customer_subscriptions).

## Deployment

```bash
npx wrangler secret put API_TOKEN  # first time only
npm run deploy
```

The `predeploy` script runs remote D1 migrations automatically.

## Cloudflare Resources

### Skills

For deeper guidance on the products used in this template, load these [Cloudflare Skills](https://github.com/cloudflare/skills):

- `cloudflare` — Workers, D1, Workflows, and the broader developer platform
- `wrangler` — CLI for deploying and managing Workers, D1, and secrets

### MCP Servers

These [Cloudflare MCP servers](https://developers.cloudflare.com/agents/model-context-protocol/mcp-servers-for-cloudflare/) can help when working with this template:

| Server           | URL                                            | Use for                                                                |
| ---------------- | ---------------------------------------------- | ---------------------------------------------------------------------- |
| Cloudflare API   | `https://mcp.cloudflare.com/mcp`               | Managing D1 databases, Workers, Workflows, and the full Cloudflare API |
| Documentation    | `https://docs.mcp.cloudflare.com/mcp`          | Looking up D1, Workflows, and Workers docs                             |
| Workers Bindings | `https://bindings.mcp.cloudflare.com/mcp`      | Building with D1 and Workflow bindings                                 |
| Workers Builds   | `https://builds.mcp.cloudflare.com/mcp`        | Managing deployments                                                   |
| Observability    | `https://observability.mcp.cloudflare.com/mcp` | Debugging logs and analytics                                           |

## Maintaining this file

Keep this AGENTS.md up to date as the template evolves. If you add bindings, API endpoints, database tables, or change the build pipeline, update this file to reflect those changes.
