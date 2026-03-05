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
