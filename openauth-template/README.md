# OpenAuth Server

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/openauth-template)

![OpenAuth Template Preview](https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/b2ff10c6-8f7c-419f-8757-e2ccf1c84500/public)

<!-- dash-content-start -->

[OpenAuth](https://openauth.js.org/) is a universal provider for managing user authentication. By deploying OpenAuth on Cloudflare Workers, you can add scalable authentication to your application. This demo showcases login, user registration, and password reset, with storage and state powered by [D1](https://developers.cloudflare.com/d1/) and [KV](https://developers.cloudflare.com/kv/).

> [!IMPORTANT]
> When using C3 to create this project, select "no" when it asks if you want to deploy. You need to follow this project's [setup steps](https://github.com/cloudflare/templates/tree/main/openauth-template#setup-steps) before deploying.

<!-- dash-content-end -->

## Getting Started

Outside of this repo, you can start a new project with this template using [C3](https://developers.cloudflare.com/pages/get-started/c3/) (the `create-cloudflare` CLI):

```bash
npm create cloudflare@latest -- --template=cloudflare/templates/openauth-template
```

A live public deployment of this template is available at [https://openauth-template.templates.workers.dev](https://openauth-template.templates.workers.dev)

## Setup Steps

1. Install the project dependencies with a package manager of your choice:
   ```bash
   npm install
   ```
2. Create a [D1 database](https://developers.cloudflare.com/d1/get-started/) with the name "openauth-template-auth-db":
   ```bash
   npx wrangler d1 create openauth-template-auth-db
   ```
   ...and update the `database_id` field in `wrangler.json` with the new database ID.
3. Run the following db migration to initialize the database (notice the `migrations` directory in this project):
   ```bash
   npx wrangler d1 migrations apply --remote openauth-template-auth-db
   ```
4. Create a [kv namespace](https://developers.cloudflare.com/kv/get-started/) with a binding named "AUTH_STORAGE":
   ```bash
   npx wrangler kv namespace create AUTH_STORAGE
   ```
   ...and update the `kv_namespaces` -> `id` field in `wrangler.json` with the new namespace ID.
5. Deploy the project!
   ```bash
   npx wrangler deploy
   ```
