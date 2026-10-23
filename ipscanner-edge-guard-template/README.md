# IPScanner Edge Guard

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/ipscanner-edge-guard-template)

<!-- dash-content-start -->

A Worker that sits in front of your site and checks every visitor with [IPScanner](https://ipscanner.io) Agentscan and IP Detection before the request reaches your origin.

- **Monitor mode** (default) adds `X-IPScanner-*` verdict headers to the request your origin receives, so your app can log, rate limit or challenge as it sees fit.
- **Enforce mode** also returns a 403 to visitors that Agentscan marks as `block`, that fall into a blocked class, or (optionally) that come through a VPN, proxy or Tor.
- Verified search engines and AI crawlers on the Agentscan allowlist are never blocked.
- Both checks run in parallel, are cached with the Cache API, and fail open: if the API is slow or unreachable, the request goes through unchanged.
- Incoming `X-IPScanner-*` headers are stripped, so clients cannot spoof a verdict.
- With `SITE_ID` set, mode and per class policy come from the [IPScanner dashboard](https://ipscanner.io/dashboard/sites), where the site's traffic shows up.
- One JSON log line per checked request, ready for Workers Logs.

### How it works

For each request the Worker reads the visitor IP from `CF-Connecting-IP` and calls the IPScanner API with the IP, User-Agent and a few browser headers. The verdicts are cached per data center, written to request headers, and the request is forwarded to your origin. The Worker uses plain `fetch` and the Cache API. It has no runtime dependencies.

The `IPSCANNER_API_KEY` secret holds your key. Get a free key at [ipscanner.io](https://ipscanner.io). Without a key, requests pass through unchecked.

<!-- dash-content-end -->

Outside of this repo, you can start a new project with this template using [C3](https://developers.cloudflare.com/pages/get-started/c3/) (the `create-cloudflare` CLI):

```sh
npm create cloudflare@latest -- --template=cloudflare/templates/ipscanner-edge-guard-template
```

A standalone copy of this Worker lives at [github.com/ipscanner/ipscanner-cloudflare](https://github.com/ipscanner/ipscanner-cloudflare). Setup notes for Cloudflare are at [ipscanner.io/cloudflare](https://ipscanner.io/cloudflare).

## Getting Started

1. Create an API key at [ipscanner.io](https://ipscanner.io). Keys look like `pk_live_` followed by 56 hex characters (test keys start with `pk_test_`).
2. Install dependencies and deploy:

   ```sh
   npm install
   npm run deploy
   ```

3. Store the key as a secret:

   ```sh
   npx wrangler secret put IPSCANNER_API_KEY
   ```

Without a key the Worker passes every request through unchecked and logs a warning once.

## Put it in front of your site

**Route (zone on Cloudflare).** Add a route to `wrangler.jsonc` and leave `ORIGIN_URL` empty. Requests that pass the guard continue to the origin in your DNS records.

```jsonc
"routes": [{ "pattern": "example.com/*", "zone_name": "example.com" }]
```

**Custom domain or workers.dev.** The Worker is the origin here, so set `ORIGIN_URL` to your backend (for example `https://backend.example.com`). Path and query string are kept.

If neither is configured, the `workers.dev` URL shows a setup page listing the headers your origin would receive. Use it to check the key and your own verdict.

## Configuration

All values are strings in the `vars` block of `wrangler.jsonc`.

| Variable            | Default                | Description                                                                                                           |
| ------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `IPSCANNER_API_KEY` |                        | Secret. Your API key.                                                                                                 |
| `MODE`              | `monitor`              | `monitor` annotates only. `enforce` also blocks.                                                                      |
| `CHECK_AGENT`       | `true`                 | Run Agentscan (`POST /v1/agentscan/check`).                                                                           |
| `CHECK_IP`          | `true`                 | Run IP Detection (`POST /v1/ip/lookup`).                                                                              |
| `BLOCK_CLASSES`     | `malicious_automation` | Comma separated Agentscan classes to block in enforce mode: `human`, `known_bot`, `ai_agent`, `malicious_automation`. |
| `BLOCK_ANONYMIZED`  | `false`                | In enforce mode, also block VPN, proxy and Tor traffic.                                                               |
| `TIMEOUT_MS`        | `1500`                 | Timeout per API call. On timeout the request is forwarded.                                                            |
| `AGENT_TTL`         | `600`                  | Seconds to cache an Agentscan verdict (the edge check verdict with `SITE_ID`) per IP and User-Agent.                  |
| `IP_TTL`            | `3600`                 | Seconds to cache an IP lookup per IP.                                                                                 |
| `SKIP_PATHS`        | static assets          | Case insensitive regex on the path. Matching requests are not checked. Empty checks everything.                       |
| `ORIGIN_URL`        | empty                  | Backend to forward to. Leave empty on a route.                                                                        |
| `IPSCANNER_API_URL` | `https://ipscanner.io` | API base URL.                                                                                                         |
| `SITE_ID`           | empty                  | Site ID from the IPScanner dashboard. When set, mode and policy come from the dashboard. See [Sites](#sites).         |
| `POLICY_TTL`        | `30`                   | Seconds to reuse a site policy before fetching it again. Used with `SITE_ID`.                                         |

`OPTIONS` requests are never checked. All other methods are.

## Sites

1. Create a site in the [IPScanner dashboard](https://ipscanner.io/dashboard/sites).
2. Set `SITE_ID` to the site's ID (`site_...`) in `wrangler.jsonc` and deploy.

Mode and per class policy (`allow`, `flag` or `block`) then come from the dashboard, and changes apply without a redeploy. `MODE`, `CHECK_AGENT`, `CHECK_IP`, `BLOCK_CLASSES` and `BLOCK_ANONYMIZED` are ignored. Each uncached visitor costs one call to `POST /v1/edge/check`.

The policy is cached per isolate and in the Cache API for `POLICY_TTL` seconds. If a refresh fails, the last policy is used for up to 24 hours. With no policy at all, requests pass. Policy and verdict share the `TIMEOUT_MS` budget.

In `enforce` mode a class set to `block` gets the 403 page and a class set to `flag` is forwarded with `X-IPScanner-Action: flag`. `monitor` never blocks. Verified crawlers always pass.

## Headers

Added to the request forwarded to your origin:

| Header                      | Source       | Example                                                  |
| --------------------------- | ------------ | -------------------------------------------------------- |
| `X-IPScanner-Status`        | Guard        | `ok`, `error`, `timeout` or `skipped`                    |
| `X-IPScanner-Class`         | Agentscan    | `human`, `known_bot`, `ai_agent`, `malicious_automation` |
| `X-IPScanner-Action`        | Agentscan    | `allow`, `flag`, `block`                                 |
| `X-IPScanner-Confidence`    | Agentscan    | `0.92`                                                   |
| `X-IPScanner-Network-Class` | IP Detection | `residential_clean`, `hosting`, `vpn`, `tor`, ...        |
| `X-IPScanner-Anonymized`    | Both         | `true` or `false`                                        |
| `X-IPScanner-Risk`          | IP Detection | `0` to `100`                                             |
| `X-IPScanner-Country`       | IP Detection | `DE`                                                     |
| `X-IPScanner-Traffic-Class` | Edge check   | `human`, `verified_bot`, `ai_agent`, `vpn`, ...          |
| `X-IPScanner-Site`          | Guard        | `site_...`, set with `SITE_ID`                           |

When a check fails or is skipped, only `X-IPScanner-Status` is set.

## Enforce rules

Without `SITE_ID`, in `enforce` mode a visitor gets a 403 page with the request ID when:

- Agentscan returns `action: block`, or
- the class is listed in `BLOCK_CLASSES`, or
- `BLOCK_ANONYMIZED` is `true` and the IP is a VPN, residential proxy or Tor exit (anonymized hosting and private relays are not blocked by this flag).

A visitor whose Agentscan signals include `allowlist_verified: true` is always allowed.

## Logs

Each checked request writes one JSON line with `ip`, `path`, `class`, `action`, `networkClass`, `decision` (`allow`, `block`, or `would_block` in monitor mode) and cache hits. With `SITE_ID` the line also has `site`, `trafficClass`, the policy source and version, and `decision` can be `flag` or `would_flag`. Observability is enabled in `wrangler.jsonc`, so these are searchable in [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/).

## Cost

Each uncached visitor uses 1 request unit per enabled check, so 2 units with both checks on. Repeat visits within `AGENT_TTL` and `IP_TTL` are served from the cache. The [Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/) is local to each Cloudflare data center, so a visitor seen in one location is checked again in another. Raise the TTLs, narrow the route, or turn off one check to reduce usage. With `SITE_ID`, the single edge check also costs 2 units per uncached visitor.

## Develop locally

```sh
cp .dev.vars.example .dev.vars
npm run dev
npm test
```

Open [http://localhost:8787](http://localhost:8787) to see the setup page.

## Preview Deployment

A live public deployment of this template is available at [https://ipscanner-edge-guard-template.templates.workers.dev](https://ipscanner-edge-guard-template.templates.workers.dev)

## Learn More

- [IPScanner API reference](https://ipscanner.io/api-documentation)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Workers routes](https://developers.cloudflare.com/workers/configuration/routing/routes/)
