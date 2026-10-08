# AgentsKit Agent Template

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/agentskit-agent-template)

Build a streaming AI agent with [AgentsKit](https://agentskit.io) and Cloudflare Workers AI. The template uses Cloudflare's native AI binding, so it does not require an external provider key.

<!-- dash-content-start -->

## AgentsKit on Cloudflare Workers

This template combines AgentsKit's provider-neutral adapter contract with Cloudflare Workers AI. It includes:

- A Workers AI adapter built with `createAdapter`
- A validated streaming chat API that emits AgentsKit chunks over SSE
- A responsive, dependency-free browser chat interface
- Cloudflare observability and static asset bindings
- Unit and end-to-end tests for the critical request flow

The Worker converts browser messages into the stable AgentsKit message contract. Its local Workers AI adapter translates Cloudflare's inference stream into provider-neutral `text`, `error`, and `done` chunks, making it straightforward to add memory, tools, RAG, or a different model later.

<!-- dash-content-end -->

## Getting started

### Prerequisites

- Node.js 18 or newer
- A Cloudflare account with Workers AI access

### Develop locally

```bash
npm install
npm run dev
```

Open `http://localhost:8787`. The local server lets you develop and test the interface without credentials. Workers AI inference always uses a remote Cloudflare resource; authenticate Wrangler and run the remote development mode to exercise live generation:

```bash
npx wrangler login
npm run dev:remote
```

Remote Workers AI requests use your Cloudflare account and may incur usage charges.

### Test and validate

```bash
npm test
npm run check
```

### Deploy

```bash
npm run deploy
```

No third-party secrets are required. The `AI` binding in `wrangler.json` gives the Worker access to Workers AI, while the `ASSETS` binding serves the browser interface.

## How it works

1. The browser sends message history to `POST /api/chat`.
2. The Worker validates roles, message count, and request size.
3. An AgentsKit adapter invokes the native Workers AI binding.
4. Workers AI events are normalized into AgentsKit stream chunks.
5. The Worker sends those chunks to the browser as server-sent events.

The default model is `@cf/meta/llama-3.1-8b-instruct-fp8`. Change `MODEL_ID` in `src/adapter.ts` to use another text-generation model supported by Workers AI.

## Project structure

```text
agentskit-agent-template/
├── public/              # Browser chat interface
├── src/adapter.ts       # Workers AI → AgentsKit adapter
├── src/index.ts         # Worker routes, validation, and SSE bridge
├── test/index.test.ts   # Unit and request-flow tests
└── wrangler.json        # AI and static asset bindings
```

## Resources

- [AgentsKit documentation](https://agentskit.io/docs)
- [Cloudflare Workers documentation](https://developers.cloudflare.com/workers/)
- [Cloudflare Workers AI models](https://developers.cloudflare.com/workers-ai/models/)
