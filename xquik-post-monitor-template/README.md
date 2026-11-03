[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/xquik-post-monitor-template)

# Xquik Post Monitor

<!-- dash-content-start -->

Track X posts for a search term. A Cron Trigger stores new posts in D1, & a small page lists them.

## Key features

- A Cron Trigger calls the Xquik search route every 6 hours.
- D1 stores each post once per search term.
- Each run asks only for posts newer than the newest stored post.
- The page lists the newest 50 posts for the current search term.
- Demo mode shows labelled sample posts when no API key is set.
- No HTTP route starts a run, so page visits spend no credits.

## Bindings & handlers

- `DB` is the D1 database for posts & the last run status.
- `XQUIK_API_KEY` is an optional secret. Demo mode runs without it.
- `XQUIK_SEARCH_QUERY` sets the search term.
- `XQUIK_SEARCH_LIMIT` sets the most posts per run.
- The `scheduled` handler fetches & stores posts.
- The `fetch` handler serves the page.

## How it works

1. The Cron Trigger starts the `scheduled` handler.
2. The Worker reads the newest stored post ID for the search term.
3. The Worker calls Xquik with that ID as `sinceId`.
4. A D1 batch writes the new posts & the run status together.
5. The `fetch` handler reads D1 & renders the page.

## About Xquik

Xquik is the world's fastest and cheapest X Twitter data API with the most complete X data. Searches & extractions charge only for delivered, unique, filter-matching results.

Xquik is an independent third-party service. Not affiliated with X Corp. "Twitter" and "X" are trademarks of X Corp.

<!-- dash-content-end -->

## Live preview

Open the [live preview](https://xquik-post-monitor-template.cc8jk4pry5.workers.dev). It runs in demo mode with sample posts.

## Getting started

1. Create a project from this template.

   ```sh
   npm create cloudflare@latest -- --template=cloudflare/templates/xquik-post-monitor-template
   ```

2. Copy the example variables. An empty key runs demo mode.

   ```sh
   cp .dev.vars.example .dev.vars
   ```

3. Apply the local D1 migration & start the dev server.

   ```sh
   npm run dev
   ```

4. Open http://localhost:8787.

5. Deploy the Worker. Wrangler creates the D1 database on your account, then applies the migration.

   ```sh
   npm run deploy
   ```

## Xquik API key

1. Sign in at https://xquik.com.
2. Confirm your email.
3. Open API Keys in the dashboard & create a key.
4. Run `npx wrangler secret put XQUIK_API_KEY`, or paste the key in `.dev.vars` locally.

The page shows a warning if Xquik rejects the key. The key check spends no credits.

## Configuration

| Setting              | Location                | Default              | Effect                      |
| -------------------- | ----------------------- | -------------------- | --------------------------- |
| `XQUIK_SEARCH_QUERY` | `vars` in wrangler.json | `cloudflare workers` | Sets the search term        |
| `XQUIK_SEARCH_LIMIT` | `vars` in wrangler.json | `10`                 | Sets the most posts per run |
| Cron schedule        | `triggers.crons`        | `0 */6 * * *`        | Runs a sync every 6 hours   |

The search term accepts [X search operators](https://github.com/Xquik-dev/x-twitter-advanced-search). The page lists only the current search term.

## Test the cron locally

`npm run dev` turns on the scheduled test route. With a key set, this command spends credits like a real run.

```sh
curl "http://localhost:8787/__scheduled?cron=0+*/6+*+*+*"
```

## Costs

Each run spends Xquik credits for the posts it returns. The defaults fetch at most 10 posts per run. The cron runs 4 times a day. That makes at most 40 results a day. Lower `XQUIK_SEARCH_LIMIT` or the cron to spend less.

## Limits

Each run stores up to `XQUIK_SEARCH_LIMIT` posts. If more arrive between runs, the older ones are skipped.

The page is public. Put [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/) in front of it to keep the search term private.

## Learn more

- [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [D1](https://developers.cloudflare.com/d1/)
- [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
