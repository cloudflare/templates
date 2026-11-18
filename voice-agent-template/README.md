[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/voice-agent-template)

# Cloudflare Docs Voice Agent

<!-- dash-content-start -->

Deploy a backend-only Cloudflare Docs voice agent built with the Agents SDK, the Cloudflare Voice API, Workers AI, and a SQLite-backed Durable Object.

The template uses one fixed agent and pipeline:

- Agent: Arya, the Cloudflare Docs agent
- Speech to text: Flux
- Language model: `@cf/openai/gpt-oss-20b`
- Text to speech: Aura-1
- Voice: Asteria
- Tool: read-only Cloudflare Docs search through MCP

The backend includes trusted agent instructions, input and output guardrails, bounded Docs MCP retries, TTS recovery, and conversation cleanup. The Voice API is in beta.

<!-- dash-content-end -->

A live public deployment is available at [https://voice-agent-template.templates.workers.dev](https://voice-agent-template.templates.workers.dev).

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a local secrets file:

   ```bash
   cp .dev.vars.example .dev.vars
   ```

3. Replace `VOICE_AGENT_TOKEN` with a strong random value:

   ```bash
   openssl rand -hex 32
   ```

4. Generate Worker types and start the Worker:

   ```bash
   npm run cf-typegen
   npm run dev
   ```

5. Deploy:

   ```bash
   npm run deploy
   ```

When you use the Deploy to Cloudflare button, the Dashboard asks for `VOICE_AGENT_TOKEN` and stores it as a Worker secret.

## Authentication

Agent HTTP requests and WebSocket upgrades require:

```text
Authorization: Bearer <VOICE_AGENT_TOKEN>
```

The token is long-lived. Do not put it in browser code, query parameters, logs, or source control. A browser application should connect through its own authenticated server, session service, or short-lived credential flow.

You can verify the protected endpoint from a trusted server or terminal:

```bash
curl --fail-with-body \
  --header "Authorization: Bearer $VOICE_AGENT_TOKEN" \
  "https://<your-worker>/agents/voice-agent/test"
```

The unauthenticated `/health` endpoint and root status page are safe for deployment checks. They do not expose the token or a Voice client.

## Customize

After deployment, the generated repository is yours. Change the trusted prompt, fixed model constants, voice, MCP tools, or guardrail behavior in source and redeploy.

## Commands

```bash
npm run dev
npm test
npm run check
npm run deploy
```

## Resources

- [Cloudflare Agents](https://developers.cloudflare.com/agents/)
- [Cloudflare Voice Agents](https://developers.cloudflare.com/agents/api-reference/voice-agents/)
- [Workers AI](https://developers.cloudflare.com/workers-ai/)
- [Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [Model Context Protocol](https://developers.cloudflare.com/agents/model-context-protocol/)
- [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
