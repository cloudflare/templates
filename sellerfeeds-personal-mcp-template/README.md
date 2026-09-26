# Personal MCP for Browser Tools

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/sellerfeeds-personal-mcp-template)

<!-- dash-content-start -->

This template deploys a personal [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) gateway on Cloudflare. It lets a [SellerFeeds browser extension](https://www.sellerfeeds.com/) register its installed tools and execute requests from an MCP client through an asynchronous task queue.

The Worker stores the tool catalog and task status in D1, temporary report files in R2, and browser wake-up connections in a Durable Object. An `OWNER_TOKEN` secret protects the MCP and extension APIs. The public landing page contains no private tools, tasks, or reports.

<!-- dash-content-end -->

## Getting started

1. In the SellerFeeds extension, open **MCP → Personal MCP** and copy the deployment key.
2. Use the deploy button above. When prompted for `OWNER_TOKEN`, paste that key. Cloudflare creates your own D1 database and R2 bucket.
3. Copy your new `workers.dev` URL to the extension and select **Test and enable**.
4. Connect an MCP client to `https://<your-worker>.workers.dev/mcp` with `Authorization: Bearer <OWNER_TOKEN>`. The extension must be online to execute its browser tools. Call `get_report` with the task ID to retrieve an asynchronous result.

The Worker initializes D1 tables on the first authenticated request. Reports and downloadable files expire after seven days. The extension keeps notification credentials locally; this gateway does not accept Feishu or DingTalk bot credentials.

`OWNER_TOKEN` is a private secret. Never put a real value in Git, an issue, or a screenshot. The repository contains no Cloudflare account ID, database ID, bucket name, or server address. `relay.invalid` is an internal Durable Object routing placeholder, not a network destination.

## Local development

Create `.dev.vars` from `.dev.vars.example` and replace the placeholder with a unique secret. Then run:

```sh
npm install
npm run dev
```

For a command-line deployment, run `npm run deploy`. The Worker creates missing tables on first use. You can apply the included migration explicitly with `npx wrangler d1 migrations apply DB --remote`.

## Preview

The template's public landing page is the only unauthenticated application page. A live preview URL will be added after Cloudflare provisions the template preview deployment. Until then, the [public source repository](https://github.com/omococola/mcp) documents the production gateway and its deployment flow.
