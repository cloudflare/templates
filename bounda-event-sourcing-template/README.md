# Event Sourcing with Bounda

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/bounda-event-sourcing-template)

<!-- dash-content-start -->

An event-sourced app on [Durable Objects](https://developers.cloudflare.com/durable-objects/), built with [Bounda](https://bounda.dev), a TypeScript framework for event sourcing and CQRS. Placing an order is a command: its handler decides, the resulting event is appended to the order's history, and a projection turns it into a row of a read model before the request answers, so the next query already sees it.

Everything lives in one Durable Object per tenant, in its [SQLite storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/): the ordered log of events, the read models, scheduled commands and the checkpoints that say how far each read model has got. Work that reacts to events after the request, such as policies, long-running processes and delayed commands, runs in the object's [alarm](https://developers.cloudflare.com/durable-objects/api/alarms/). There is nothing else to run: no queue, no cron, no external database.

- **Commands, events, read models and queries** are plain modules under `app/`, and their types are inferred from those modules.
- **History is kept**: a read model can be rebuilt from the events at any time, without taking it offline.
- **One store per tenant**: the `x-bounda-tenant` header picks the Durable Object, so tenants never share storage.
- **[Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)** serves a page that places and lists orders through the JSON API.

<!-- dash-content-end -->

Outside of this repo, you can start a new project with this template using [C3](https://developers.cloudflare.com/pages/get-started/c3/) (the `create-cloudflare` CLI):

```bash
npm create cloudflare@latest -- --template=cloudflare/templates/bounda-event-sourcing-template
```

The same project also comes out of `npm create bounda@latest my-app -- --framework cloudflare`.

A live public deployment of this template is available at [https://bounda-event-sourcing-template.templates.workers.dev](https://bounda-event-sourcing-template.templates.workers.dev)

## Getting Started

Install the dependencies:

```bash
npm install
```

Every script below first runs `bounda generate`, which writes the typed registry under `.bounda/` and a `+types/` folder next to each module from the files in `app/`. Run `npx bounda generate` yourself after adding a module, so your editor sees its types.

Start the development server and open [http://localhost:8787](http://localhost:8787):

```bash
npm run dev
```

Or talk to the API from a terminal:

```bash
curl -X POST localhost:8787/commands/placeOrder \
  -H 'content-type: application/json' -H 'x-bounda-tenant: acme' \
  -d '{"orderId":"018f6a5e-4c3c-7c1e-9d4b-0b2c4a1d8e01","customerId":"ada","total":42}'
curl -X POST localhost:8787/queries/listOrders \
  -H 'content-type: application/json' -H 'x-bounda-tenant: acme' \
  -d '{"customerId":"ada"}'
```

Run the tests, which run inside `workerd` with the Durable Object:

```bash
npm test
```

Deploy to your account:

```bash
npm run deploy
```

## How it is organised

```
app/domain/order/           the order aggregate: its state, its command and its event
app/read/orders/            a read model: its fields, its projection and its query
bounda.config.ts            storage: cloudflare(), the object's own SQLite
src/worker.ts               the Durable Object class and the Worker in front of it
public/index.html           the page, served as a static asset
wrangler.jsonc              the STORE binding and the SQLite migration for the class
tests/                      the domain on an in-memory store, and the API in workerd
```

`src/worker.ts` uses `createWorker`, a JSON API with no authentication: a starting point. An app with users writes its own `fetch` and talks to its store with `connect(env.STORE.get(id))`, which types `commands` and `queries` from the modules in `app/`.

## Learn more

- [Bounda on Cloudflare](https://docs.bounda.dev/adapters/cloudflare/): how the object runs, limits and cost.
- [Getting started with Bounda](https://docs.bounda.dev/getting-started/): commands, events, read models and queries.
- [Durable Objects](https://developers.cloudflare.com/durable-objects/) and their [SQLite storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/).
