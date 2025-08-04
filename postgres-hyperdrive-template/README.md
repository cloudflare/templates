# Worker + PostgreSQL using Hyperdrive

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/postgres-hyperdrive-template)

<!-- dash-content-start -->

[Hyperdrive](https://developers.cloudflare.com/hyperdrive/) makes connecting to your regional SQL database from Cloudflare Workers fast by:

- Pooling database connections globally 🌎
- Eliminating roundtrips with edge connection setup 🔗
- Caching query results for speed and scale (optional) ⚡️

Check out the [demo](https://hyperdrive-demo.pages.dev/) to see how Hyperdrive can provide up to 4x faster queries. Learn more about [how Hyperdrive works](https://developers.cloudflare.com/hyperdrive/configuration/how-hyperdrive-works/) to speed up your database access.

This project demonstrates a Worker connecting to a PostgreSQL database using Hyperdrive. Upon loading your Worker, your will see an administrative dashboard that showcases simple
create, read, update, delete commands to your PostgreSQL database with Hyperdrive.

> [!IMPORTANT]
> When creating a Hyperdrive configuration as part of this template, disable caching from your Hyperdrive configuration to ensure your administrative shows updated values. Learn more about [Hyperdrive's built-in query caching](https://developers.cloudflare.com/hyperdrive/configuration/query-caching/) and when to use it.
>
> When using C3 to create this project, select "no" when it asks if you want to deploy. You need to follow this project's [setup steps](https://github.com/cloudflare/templates/tree/main/hyperdrive-template#setup-steps) before deploying.

<!-- dash-content-end -->

## Getting Started

Outside of this repo, you can start a new project with this template using [C3](https://developers.cloudflare.com/pages/get-started/c3/) (the `create-cloudflare` CLI):

```
npm create cloudflare@latest -- --template=cloudflare/templates/postgres-hyperdrive-template
```

A live public deployment of this template is available at [https://postgres-hyperdrive-template.templates.workers.dev](https://postgres-hyperdrive-template.templates.workers.dev)

## Setup Steps

1. Install the project dependencies with a package manager of your choice:
   ```bash
   npm install
   ```
2. Create a [Hyperdrive configuration](https://developers.cloudflare.com/hyperdrive/get-started/) with the name "hyperdrive-configuration":

   ```bash
   npx wrangler hyperdrive create hyperdrive-configuration --connection-string="postgres://<DB_USER>:<DB_PASSWORD>@<DB_HOSTNAME_OR_IP_ADDRESS>:5432/<DATABASE_NAME>" --caching-disabled
   ```

   ...and update the `hyperdrive` `id` field in `wrangler.json` with the new Hyperdrive ID. You can also specify a connection string for a local PostgreSQL database used for development using the `hyperdrive` `localConnectionString` field.

3. Deploy the project!
   ```bash
   npx wrangler deploy
   ```
4. (Optional) To run your project locally while connecting to your remote database, you must use `wrangler dev --remote` which will run your Worker in Cloudflare's environment so that you can access your remote database. Run the following:
   ```bash
   npx wrangler dev --remote
   ```
5. Monitor your worker
   ```bash
   npx wrangler tail
   ```
