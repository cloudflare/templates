# Worker + MySQL using Hyperdrive

<!-- dash-content-start -->

[Hyperdrive](https://developers.cloudflare.com/hyperdrive/) makes connecting to your regional database from Cloudflare Workers fast. This project demonstrates a Worker connecting to a MySQL database using Hyperdrive.

Upon loading your Worker, your will see the list of MySQL tables in your database, as obtained with the following query:

```SQL
SHOW TABLES;
```

> [!IMPORTANT]
> When using C3 to create this project, select "no" when it asks if you want to deploy. You need to follow this project's [setup steps](https://github.com/cloudflare/templates/tree/main/d1-template#setup-steps) before deploying.

## Getting Started

Outside of this repo, you can start a new project with this template using [C3](https://developers.cloudflare.com/pages/get-started/c3/) (the `create-cloudflare` CLI):

```
npm create cloudflare@latest -- --template=cloudflare/templates/mysql-hyperdrive-template
```

A live public deployment of this template is available at [https://mysql-hyperdrive-template.templates.workers.dev](https://mysql-hyperdrive-template.templates.workers.dev)

## Setup Steps

1. Install the project dependencies with a package manager of your choice:
   ```bash
   npm install
   ```
2. Create a [Hyperdrive configuration](https://developers.cloudflare.com/hyperdrive/get-started/) with the name "hyperdrive-configuration":
   ```bash
   npx wrangler hyperdrive create hyperdrive-configuration --connection-string="mysql://<DB_USER>:<DB_PASSWORD>@<DB_HOSTNAME_OR_IP_ADDRESS>:3306/<DATABASE_NAME>"
   ```
   ...and update the `hyperdrive` `id` field in `wrangler.json` with the new Hyperdrive ID. You can also specify a connection string for a local MySQL database used for development using the `hyperdrive` `localConnectionString` field.
3. Deploy the project!
   ```bash
   npx wrangler deploy
   ```
4. (Optional) To run your project locally while connecting to your remote database, you must use `wrangler dev --remote` which will run your Worker in Cloudflare's environment so that you can access your remote database. Run the following:
   ```bash
   npx wrangler dev --remote
   ``` 