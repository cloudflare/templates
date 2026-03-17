# React Router Starter Template

A full-stack React application on Cloudflare Workers using React Router v7 with SSR, TailwindCSS v4, and the Cloudflare Vite plugin. Renders a welcome page that displays a message loaded from a Cloudflare environment variable, demonstrating the data-loading pipeline from Worker fetch handler through React Router loader to React component.

## Setup

```bash
npm install
npm run dev
```

No database, bindings, or secrets needed out of the box.

## Configuration

| Name                    | Type    | Required | Description                                                        |
| ----------------------- | ------- | -------- | ------------------------------------------------------------------ |
| `VALUE_FROM_CLOUDFLARE` | Env var | No       | Displayed on the welcome page. Defaults to "Hello from Cloudflare" |

This is a minimal starter. Add bindings to `wrangler.json` and run `npm run cf-typegen` to regenerate types.

## Development

The Worker entry point (`workers/app.ts`) wraps React Router's `createRequestHandler`, passing `env` and `ctx` into the load context as `context.cloudflare.env` and `context.cloudflare.ctx`. Route files under `app/routes/` export loaders and components; register new routes in `app/routes.ts`.

The SSR entry (`app/entry.server.tsx`) streams HTML with `renderToReadableStream` and uses `isbot` for bot-aware buffering.

Vite is configured with the `cloudflare()`, `tailwindcss()`, `reactRouter()`, and `tsconfigPaths()` plugins. The `~/` path alias maps to `./app/`.

Note: the `typecheck` script references a nonexistent `typegen` script. Use `npm run cf-typegen && tsc -b` instead.

## Deployment

```bash
npm run deploy
```

## Cloudflare Resources

### Skills

For deeper guidance on the products used in this template, load these [Cloudflare Skills](https://github.com/cloudflare/skills):

- `cloudflare` — Workers, environment variables, and the broader developer platform
- `wrangler` — CLI for deploying and managing Workers
- `workers-best-practices` — Patterns for Workers development

### MCP Servers

These [Cloudflare MCP servers](https://developers.cloudflare.com/agents/model-context-protocol/mcp-servers-for-cloudflare/) can help when working with this template:

| Server           | URL                                            | Use for                                            |
| ---------------- | ---------------------------------------------- | -------------------------------------------------- |
| Cloudflare API   | `https://mcp.cloudflare.com/mcp`               | Managing Workers, DNS, and the full Cloudflare API |
| Documentation    | `https://docs.mcp.cloudflare.com/mcp`          | Looking up Workers and Vite plugin docs            |
| Workers Bindings | `https://bindings.mcp.cloudflare.com/mcp`      | Building with Workers bindings                     |
| Workers Builds   | `https://builds.mcp.cloudflare.com/mcp`        | Managing deployments                               |
| Observability    | `https://observability.mcp.cloudflare.com/mcp` | Debugging logs and analytics                       |

## Maintaining this file

Keep this AGENTS.md up to date as the template evolves. If you add bindings, routes, or change the build pipeline, update this file to reflect those changes.
