# D1 Template

A minimal Cloudflare Worker that queries a D1 (serverless SQLite) database and renders the results as HTML. Runs `SELECT * FROM comments LIMIT 3` against a seeded table. Good starting point for any Worker + D1 project.

## Setup

```bash
npm install
npx wrangler d1 create d1-template-database
# Update database_id in wrangler.json with the returned ID
npm run dev
```

The `dev` script seeds the local D1 database via migrations before starting the dev server.

## Configuration

| Name | Type        | Required | Description                              |
| ---- | ----------- | -------- | ---------------------------------------- |
| `DB` | D1 Database | Yes      | Bound to database `d1-template-database` |

No secrets or environment variables needed. After creating the database, update `database_id` in `wrangler.json`.

## Development

The Worker entry point (`src/index.ts`) runs a prepared statement against the `DB` binding and passes the results to a rendering function (`src/renderHtml.ts`). There's no router — every request returns the same page.

Schema changes go in new migration files under `migrations/`. Apply locally with `npx wrangler d1 migrations apply DB --local`. Run `npm run cf-typegen` after changing bindings to regenerate types.

## Deployment

```bash
npm run deploy
```

The `predeploy` script runs remote D1 migrations automatically.

## Cloudflare Resources

### Skills

For deeper guidance on the products used in this template, load these [Cloudflare Skills](https://github.com/cloudflare/skills):

- `cloudflare` — Workers, D1, and the broader developer platform
- `wrangler` — CLI for deploying and managing Workers and D1

### MCP Servers

These [Cloudflare MCP servers](https://developers.cloudflare.com/agents/model-context-protocol/mcp-servers-for-cloudflare/) can help when working with this template:

| Server           | URL                                            | Use for                                                          |
| ---------------- | ---------------------------------------------- | ---------------------------------------------------------------- |
| Cloudflare API   | `https://mcp.cloudflare.com/mcp`               | Managing D1 databases, Workers, DNS, and the full Cloudflare API |
| Documentation    | `https://docs.mcp.cloudflare.com/mcp`          | Looking up D1 and Workers docs                                   |
| Workers Bindings | `https://bindings.mcp.cloudflare.com/mcp`      | Building with D1 bindings                                        |
| Workers Builds   | `https://builds.mcp.cloudflare.com/mcp`        | Managing deployments                                             |
| Observability    | `https://observability.mcp.cloudflare.com/mcp` | Debugging logs and analytics                                     |

## Maintaining this file

Keep this AGENTS.md up to date as the template evolves. If you add bindings, change the schema, or modify the architecture, update this file to reflect those changes.
