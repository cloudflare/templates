# Postgres Hyperdrive Template

A Cloudflare Worker that connects to a PostgreSQL database via Hyperdrive and provides a CRUD admin dashboard for managing organizations and users. The frontend is a vanilla JS SPA (no build step) served as static assets. Hyperdrive handles connection pooling and acceleration.

## Setup

```bash
npm install

# Create a Hyperdrive configuration pointing to your Postgres database
npx wrangler hyperdrive create hyperdrive-configuration \
  --connection-string="postgres://user:password@host:5432/dbname"

# Update the id in wrangler.jsonc with the returned Hyperdrive ID
npm run dev
```

On first load, the dashboard prompts you to initialize the database tables via `POST /api/initialize`.

For local dev, a `localConnectionString` in `wrangler.jsonc` defaults to `postgresql://postgres:postgres@localhost:5432/defaultdb`. You need a local Postgres instance (e.g., `docker run -d -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres`).

## Configuration

| Name         | Type          | Required | Description                                 |
| ------------ | ------------- | -------- | ------------------------------------------- |
| `HYPERDRIVE` | Hyperdrive    | Yes      | Connection pool to your PostgreSQL database |
| `ASSETS`     | Static Assets | Yes      | Serves the frontend from `public/`          |

No secrets or environment variables. The `nodejs_compat` compatibility flag is required for the `pg` library.

## Development

The Worker entry point (`src/index.ts`) routes `/api/*` requests to handler functions and lets the `ASSETS` binding serve everything else. Each API request creates a `pg.Client` using `env.HYPERDRIVE.connectionString`, runs parameterized SQL queries, and closes the connection in a `finally` block via `ctx.waitUntil(client.end())`.

The frontend is vanilla JS under `public/js/` with no build step — edit and reload.

Tables are created at runtime via the `/api/initialize` endpoint rather than a migration system.

Note: `src/utils.ts` defines a Postgres identifier validator but it's not currently imported anywhere.

## Deployment

```bash
npm run deploy
```

Make sure the Hyperdrive ID in `wrangler.jsonc` is correct. Tables are initialized from the UI on first use.

## Cloudflare Resources

### Skills

For deeper guidance on the products used in this template, load these [Cloudflare Skills](https://github.com/cloudflare/skills):

- `cloudflare` — Workers, Hyperdrive, and the broader developer platform
- `wrangler` — CLI for deploying and managing Workers and Hyperdrive
- `workers-best-practices` — Patterns for Workers development

### MCP Servers

These [Cloudflare MCP servers](https://developers.cloudflare.com/agents/model-context-protocol/mcp-servers-for-cloudflare/) can help when working with this template:

| Server           | URL                                            | Use for                                                           |
| ---------------- | ---------------------------------------------- | ----------------------------------------------------------------- |
| Cloudflare API   | `https://mcp.cloudflare.com/mcp`               | Managing Hyperdrive configs, Workers, and the full Cloudflare API |
| Documentation    | `https://docs.mcp.cloudflare.com/mcp`          | Looking up Hyperdrive and Workers docs                            |
| Workers Bindings | `https://bindings.mcp.cloudflare.com/mcp`      | Building with Hyperdrive bindings                                 |
| Workers Builds   | `https://builds.mcp.cloudflare.com/mcp`        | Managing deployments                                              |
| Observability    | `https://observability.mcp.cloudflare.com/mcp` | Debugging logs and analytics                                      |

## Maintaining this file

Keep this AGENTS.md up to date as the template evolves. If you add bindings, API endpoints, or change the database setup approach, update this file to reflect those changes.
