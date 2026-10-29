# Worker Publisher

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/worker-publisher-template)

<!-- dash-content-start -->

A Cloudflare Worker that creates and deploys Workers to a Dispatch Namespace via the Cloudflare SDK.

## How it works

- Automatically creates a Workers for Platforms dispatch namespace
- Uses Cloudflare SDK to deploy Workers to the namespace
- Each deployed Worker gets its own /{worker-name} path
- Main Worker acts as a router, forwarding requests to deployed Workers
- Each deployed Worker runs in its own isolated environment

You can modify this and use it to deploy static sites or full stack applications at scale, build a vibe coding platform, deploy personalized AI agents ... the possibilities are endless!

<!-- dash-content-end -->

## Setup

After you click "Deploy to Cloudflare", you'll be prompted for:

- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID
- `CLOUDFLARE_API_TOKEN` - Your Cloudflare API token with Workers:Edit permission

## Toolchain

This starter uses [Vite+](https://viteplus.dev). Use Node.js 24.22 or later in
Node.js 24, then install the dependencies with `npm install`. A global `vp`
installation is optional.

- `npm run check:toolchain` checks formatting and lint rules.
- `npm run format` formats the project.
- `npm run check` also runs this starter's existing project checks.

Use the documented development, build, and deployment scripts for this starter.
Framework commands and resource setup remain part of those scripts. Keep the
Vite alias and Vitest override aligned with the installed Vite+ release.
