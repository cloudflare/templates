# To Do List App

Manage your to do list with [Cloudflare Workers Assets](https://developers.cloudflare.com/workers/static-assets/) + [Remix](https://remix.run/) + [Cloudflare Workers KV](https://developers.cloudflare.com/kv/).

![To Do List template preview](https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/923473bc-a285-487c-93db-e0ddea3d3700/public)

<!-- dash-content-start -->

## How it Works

This is a simple to do list app that allows you to add, remove, and mark tasks as complete. The project is a Cloudflare Workers Assets application built with Remix. It uses Cloudflare Workers KV to store the to do list items. The [Remix Vite Plugin](https://remix.run/docs/en/main/guides/vite#vite) has a Cloudflare Dev Proxy that enables you to use [Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/) provided by the Cloudflare Developer Platform.

<!-- dash-content-end -->

## Develop Locally

Use this template with [C3](https://developers.cloudflare.com/pages/get-started/c3/) (the `create-cloudflare` CLI):

```
npm create cloudflare@latest -- --template=cloudflare/templates/to-do-list-kv
```

## Preview Deployment

A live public deployment of this template is available at [https://to-do-list-kv.templates.workers.dev/](https://to-do-list-kv.templates.workers.dev/)
