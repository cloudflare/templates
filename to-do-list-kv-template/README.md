# To-Do List App

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/to-do-list-kv-template)

![To-Do List Template Preview](https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/923473bc-a285-487c-93db-e0ddea3d3700/public)

<!-- dash-content-start -->

Manage your to-do list with [Cloudflare Workers Assets](https://developers.cloudflare.com/workers/static-assets/) + [Remix](https://remix.run/) + [Cloudflare Workers KV](https://developers.cloudflare.com/kv/).

## How It Works

This is a simple to-do list app that allows you to add, remove, and mark tasks as complete. The project is a Cloudflare Workers Assets application built with Remix. It uses Cloudflare Workers KV to store the to do list items. The [Remix Vite Plugin](https://remix.run/docs/en/main/guides/vite#vite) has a Cloudflare Dev Proxy that enables you to use [Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/) provided by the Cloudflare Developer Platform.

> [!IMPORTANT]
> When using C3 to create this project, select "no" when it asks if you want to deploy. You need to follow this project's [setup steps](https://github.com/cloudflare/templates/tree/main/to-do-list-kv-template#setup-steps) before deploying.

<!-- dash-content-end -->

## Getting Started

Outside of this repo, you can start a new project with this template using [C3](https://developers.cloudflare.com/pages/get-started/c3/) (the `create-cloudflare` CLI):

```bash
npm create cloudflare@latest -- --template=cloudflare/templates/to-do-list-kv-template
```

A live public deployment of this template is available at [https://to-do-list-kv-template.templates.workers.dev](https://to-do-list-kv-template.templates.workers.dev)

## Setup Steps

1. Install the project dependencies with a package manager of your choice:
   ```bash
   npm install
   ```
2. Create a [kv namespace](https://developers.cloudflare.com/kv/get-started/) with a binding named "TO_DO_LIST":
   ```bash
   npx wrangler kv namespace create TO_DO_LIST
   ```
   ...and update the `kv_namespaces` -> `id` field in `wrangler.json` with the new namespace ID.
3. Deploy the project!
   ```bash
   npx wrangler deploy
   ```
