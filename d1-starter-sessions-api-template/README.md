# d1-starter-sessions-api

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/d1-starter-sessions-api-template)

<!-- dash-content-start -->

Starter repository using Cloudflare Workers with D1 database and the new [D1 Sessions API for read replication](https://developers.cloudflare.com/d1/best-practices/read-replication/#use-sessions-api).

## What is the demo?

This demo simulates purchase orders administration.
There are two main actions you can do.

1. Create an order with a `customerId`, `orderId`, and `quantity`.
2. List all orders.

The UI when visiting the deployed Worker project shows 3 buttons.

- **Create order & List**
  - Creates a new order using the provided customer ID with a random order ID and quantity.
  - Does a `POST /api/orders` request to the Worker, and its handler uses the Sessions API to do an `INSERT` first for the new order that will be forwarded to the primary database instance, followed by a `SELECT` query to list all orders that will be executed by nearest replica database.
- **List orders**
  - Lists every order recorded in the database.
  - Does a `GET /api/orders` request to the Worker, and its handler uses the Sessions API to do a `SELECT` query to list the orders that will be executed by the nearest replica database.
- **Reset**
  - Drops and recreates the orders table.
  - Gets executed by the primary database.

The UI JavaScript code maintains the latest `bookmark` returned by the API and sends it along every subsequent request.
This ensures that we have sequential consistency in our observed database results and all our actions are properly ordered.

Read more information about how the Sessions API works, and how sequential consistency is achieved in the [D1 read replication documentation](https://developers.cloudflare.com/d1/best-practices/read-replication/).

<!-- dash-content-end -->

## Deploy

1. Checkout the project locally.
2. Run `npm ci` to install all dependencies.
3. Run `npm run deploy` to deploy to your Cloudflare account.
4. Visit the URL you got in step 3.

## Local development

1. Run `npm run dev` to start the development server.
2. Visit <http://localhost:8787>.

Note: The "Served by Region" information won't be shown when running locally.
