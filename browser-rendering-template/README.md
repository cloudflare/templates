# Browser Rendering Screenshots

A Cloudflare Worker that takes a screenshot of any web page using [Browser Rendering](https://developers.cloudflare.com/browser-rendering/) and [Cloudflare's fork of Puppeteer](https://developers.cloudflare.com/browser-run/puppeteer/).

<!-- dash-content-start -->

This template launches a headless Chromium browser from a Worker via the Browser Rendering binding, navigates to a URL you provide, and returns a JPEG screenshot. Visit the deployed Worker for a small form, or call the endpoint directly with `/?url=https://example.com`.

**Key features**

- Headless browser automation on Workers with the `browser` binding — no servers or browser infrastructure to manage.
- Uses [`@cloudflare/puppeteer`](https://developers.cloudflare.com/browser-run/puppeteer/) to drive the page and capture the screenshot.
- Validates and normalizes the requested URL, and always closes the browser session.

> [!NOTE]
> Browser Rendering runs on both the Workers Free and Paid plans within the [included usage limits](https://developers.cloudflare.com/browser-run/pricing/).

<!-- dash-content-end -->

## Getting Started

Outside of this repo, you can start a new project with this template using [C3](https://developers.cloudflare.com/pages/get-started/c3/) (the `create-cloudflare` CLI):

```sh
npm create cloudflare@latest -- --template=cloudflare/templates/browser-rendering-template
```

A live deployment of this template is available at [its `*.workers.dev` URL after you deploy it](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/).

## Develop

Install dependencies and start a local development server:

```sh
npm install
npm run dev
```

Then open the printed local URL. To take a screenshot, append a `url` query parameter, for example `http://localhost:8787/?url=https://example.com`.

> [!NOTE]
> Browser Rendering does not run in local simulation. To drive a real headless browser during local development, set `"remote": true` on the `browser` binding in `wrangler.json` (see [remote bindings](https://developers.cloudflare.com/workers/development-testing/#remote-bindings)).

## Deploy

```sh
npm run deploy
```

Once deployed, take your first screenshot at `https://<your-worker>.<your-subdomain>.workers.dev/?url=https://example.com`.
