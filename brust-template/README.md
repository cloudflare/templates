<img src="./public/favicon.svg" alt="brust logo" width="64" height="64" />

# Brust Starter

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/brust-template)

<!-- dash-content-start -->

A starter for [brust](https://brust.dev), a framework that compiles React components ahead of time into templates and serves them from a Worker. Pages render on the server; only the components that need interactivity ship JavaScript to the browser.

## Features

- Server-side rendering on Workers, with static files served by Workers Static Assets
- React components (`useState`, props, children) compiled at build time; a `useState` counter runs in the browser as a small signal, without shipping React
- Typed server actions with [Elysia](https://elysiajs.com/), served by the same Worker under `/_brust/action`; the Actions page sends a form to `POST /greet` through the typed client
- Client-side navigation between pages: a link click swaps the page in place, without a full reload
- A Deploy to Cloudflare button in the footer of every page
- Tailwind CSS v4, built into one hashed stylesheet
- Built-in Observability to monitor your Worker

## How it works

`routes.tsx` declares one layout and two pages, Home (`/`) and Actions (`/actions`). `brust build --target cloudflare` compiles them, bundles the Worker and the client assets, and writes a ready-to-deploy Wrangler config to `dist/cf/wrangler.jsonc`. The app-root `wrangler.jsonc` holds your own settings (bindings, vars); brust merges it into the generated config.

Each request reaches brust's server core, written in Rust and compiled to WebAssembly. It ships prebuilt as `@brust/core-cf`, installed with `@brust/core`, so you need no Rust toolchain. The core matches routes, renders pages and checks action requests (method, body size, cross-site), then calls your `actions.ts` Elysia app in the same isolate. Static files never reach it: Workers Static Assets serves them.

<!-- dash-content-end -->

## Getting Started

Outside of this repo, you can start a new project with this template using [C3](https://developers.cloudflare.com/pages/get-started/c3/) (the `create-cloudflare` CLI):

```bash
npm create cloudflare@latest -- --template=cloudflare/templates/brust-template
```

A live public deployment of this template is available at [https://template.brust.dev](https://template.brust.dev)

The brust CLI runs on [Bun](https://bun.sh). It is installed as a dev dependency, so no global install is needed.

### Installation

```bash
npm install
```

### Development

Build for Workers and run it locally with `wrangler dev` (rebuilds on save):

```bash
npm run dev
```

The hello action answers at `/_brust/action/hello?name=you`:

```bash
curl 'http://localhost:8787/_brust/action/hello?name=you'
# {"message":"Hello, you!"}
```

The greet action takes a JSON body; an empty or too long name answers 422:

```bash
curl -X POST 'http://localhost:8787/_brust/action/greet' -H 'content-type: application/json' -d '{"name":"you"}'
# {"message":"Hello, you!","at":"..."}
```

### Deployment

```bash
npm run deploy
```

## Project layout

- `routes.tsx`: the route table (`defineRoutes`), one layout and two pages
- `components/Layout.tsx`: the document root (`<html>` with `<Outlet />`), top bar and footer, imports `app.css`
- `pages/HomePage.tsx`, `pages/ActionsPage.tsx`: the two pages
- `components/Counter.tsx`: a `useState` counter, compiled to a native component
- `components/GreetForm.tsx`: a form that calls `POST /greet` through `lib/api.ts`
- `components/DeployButton.tsx`: the Deploy to Cloudflare button
- `lib/api.ts`: the typed actions client (`client<App>()`)
- `actions.ts`: an Elysia app served under `/_brust/action` (`GET /hello`, `POST /greet`)
- `public/`: static files, served at `/public/...`
- `brust.toml`: brust settings (actions, the Worker compatibility date)
- `wrangler.jsonc`: your Cloudflare settings; brust owns `main`, `assets` and `compatibility_date`

## Learn more

- [brust docs](https://brust.dev)
- [Routes](https://brust.dev/docs/routing)
- [Actions](https://brust.dev/docs/actions)
