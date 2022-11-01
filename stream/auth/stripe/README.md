# Cloudflare Stream + Stripe

Host and monetize **paid** live events that you fully control, on your own website, using just [Cloudflare Stream](https://www.cloudflare.com/products/cloudflare-stream/) and [Stripe Checkout](https://stripe.com/payments/checkout).

Inspired by Stripe Checkout's [examples](https://github.com/stripe-samples/checkout-one-time-payments), and adapted for Cloudflare Workers.

## Prerequisites

### Setup Stripe

1. Install the Stripe CLI (`brew install stripe/stripe-cli/stripe`)
2. Create a Stripe account, add a name to the connected business
3. Copy the test publishable key from the Stripe Dashboard, and add it to `wrangler.toml` as `STRIPE_PUBLISHABLE_KEY`
4. Copy the test secret key from the Stripe Dashboard, and add it to `wrangler.toml` as `STRIPE_SECRET_KEY`
5. Create a ticket price for the live event using the Stripe CLI. For example, the following command creates a new product, called `demo`, with a price of $5. `stripe prices create --unit-amount 500 --currency usd -d "product_data[name]=demo"`.
6. Copy the `id` of the price you just generated, and add it to `wrangler.toml` as `PRICE`.

### Setup Cloudflare Stream

1. Create a Cloudflare account, start a subscription to Cloudflare Stream.
2. Copy your Cloudflare account ID, and add it to `wrangler.toml` as `CLOUDFLARE_ACCOUNT_ID`
3. Create a Cloudflare API token with permissions to Stream, and add it to `wrangler.toml` as `CLOUDFLARE_API_TOKEN`
4. Create a new live input with Cloudflare Stream, copy its UID, and add it to `wrangler.toml` as `CLOUDFLARE_STREAM_LIVE_INPUT_UID`

## Run locally

1. `stripe listen --forward-to localhost:8788/api/webhook` (leave this running)
2. Copy the URL that ^ generates, add to `wrangler.toml` as `STRIPE_WEBHOOK_SECRET` (in production use `wrangler secret put STRIPE_WEBHOOK_SECRET`)
3. `npm run dev-api` (Cloudflare Worker, runs on localhost:8788)
4. `npm run dev-frontend` (Cloudflare Pages, runs on localhost:8787)

## Start streaming, and test locally!

1. Start streaming live video to the live input you created earlier. To quickly stream test content you can use the [ffmpeg](https://ffmpeg.org/) command `ffmpeg -r 30 -f lavfi -i testsrc -vf scale=1280:960 -vcodec libx264 -profile:v baseline -pix_fmt yuv420p -f flv rtmps://live.cloudflare.com:443/live/<RTMPS_KEY_FOR_YOUR_CLOUDFLARE_STREAM_LIVE_INPUT>`
2. Test the checkout flow by adding payment details (using the [Stripe test cards](https://stripe.com/docs/testing), while in development) — once payment succeeds, you will be redirected to `/watch`, where you can watch the live event. This page is authenticated — only those who pay have access to view.

## Limitations

- Currently built as separate Worker and Pages apps because `node_compat` mode for Cloudflare Pages can't yet be deployed to production. Some URLs are hardcoded to localhost currently.
