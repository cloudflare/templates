# sed.sh URL Shortener Worker

A Cloudflare Worker that creates tracked short links using the [sed.sh](https://sed.sh) API. Send a POST request with a target URL and get back a short link with click analytics.

<!-- dash-content-start -->

## Getting started

1. Deploy this Worker to your Cloudflare account.
2. Set your sed.sh API key as a secret:
   ```sh
   wrangler secret put SED_SH_API_KEY
   ```
3. Send a POST request to shorten a URL:
   ```sh
   curl -X POST https://your-worker.your-subdomain.workers.dev \
     -H "Content-Type: application/json" \
     -d '{"targetUrl": "https://example.com/very/long/path"}'
   ```

## Features

- Create tracked short links with click analytics
- Links hosted at sed.sh with automatic expiration
- CORS-enabled — call from frontend apps
- Pay-per-use pricing ($0.003/click), no subscriptions

<!-- dash-content-end -->

## Get a sed.sh API key

Sign up free at [sed.sh/signup](https://sed.sh/signup) and create an API key at [sed.sh/account](https://sed.sh/account).

## Development

```sh
npm install
wrangler dev
```

## Deploy

```sh
wrangler deploy
wrangler secret put SED_SH_API_KEY
```
