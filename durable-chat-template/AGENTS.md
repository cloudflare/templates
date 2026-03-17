# Durable Chat Template

A real-time chat application using Cloudflare Durable Objects and PartyKit. Each chat room is a Durable Object instance with WebSocket connections and SQLite-backed message persistence. The frontend is a React SPA bundled with esbuild. Sharing a room URL lets multiple users chat in real time.

## Setup

```bash
npm install
npm run dev
```

No database setup or migrations needed — the Durable Object creates its SQLite table on first use.

## Configuration

| Name     | Type           | Required | Description                              |
| -------- | -------------- | -------- | ---------------------------------------- |
| `Chat`   | Durable Object | Yes      | DO namespace for the Chat class          |
| `ASSETS` | Static Assets  | Yes      | Serves files from `./public` in SPA mode |

No secrets or environment variables.

## Development

The server (`src/server/index.ts`) has a Worker fetch handler that routes PartyKit WebSocket upgrades to the `Chat` Durable Object, falling back to static asset serving via the `ASSETS` binding. The `Chat` class extends `partyserver.Server` with hibernation enabled — it persists messages to DO SQLite storage and broadcasts to all connected clients.

The client (`src/client/index.tsx`) is a React SPA using `react-router` for room URLs and `partysocket/react` for WebSocket connectivity. It's bundled by esbuild via the `build.command` in `wrangler.json`, which runs automatically during dev and deploy.

Shared types and constants live in `src/shared.ts` and are imported by both client and server.

## Deployment

```bash
npm run deploy
```

The esbuild step and DO migration run automatically.

## Cloudflare Resources

### Skills

For deeper guidance on the products used in this template, load these [Cloudflare Skills](https://github.com/cloudflare/skills):

- `durable-objects` — Stateful coordination, SQLite storage, WebSockets, hibernation
- `cloudflare` — Workers and the broader developer platform
- `wrangler` — CLI for deploying and managing Workers and Durable Objects

### MCP Servers

These [Cloudflare MCP servers](https://developers.cloudflare.com/agents/model-context-protocol/mcp-servers-for-cloudflare/) can help when working with this template:

| Server           | URL                                            | Use for                                                        |
| ---------------- | ---------------------------------------------- | -------------------------------------------------------------- |
| Cloudflare API   | `https://mcp.cloudflare.com/mcp`               | Managing Workers, Durable Objects, and the full Cloudflare API |
| Documentation    | `https://docs.mcp.cloudflare.com/mcp`          | Looking up Durable Objects and Workers docs                    |
| Workers Bindings | `https://bindings.mcp.cloudflare.com/mcp`      | Building with DO bindings                                      |
| Workers Builds   | `https://builds.mcp.cloudflare.com/mcp`        | Managing deployments                                           |
| Observability    | `https://observability.mcp.cloudflare.com/mcp` | Debugging logs and analytics                                   |

## Maintaining this file

Keep this AGENTS.md up to date as the template evolves. If you add bindings, change the message format, or modify the architecture, update this file to reflect those changes.
