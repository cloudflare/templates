# x402-proxy Setup Guide for AI Agents

Context for AI coding agents to help users set up x402-proxy for payment-gated content.

## What is x402-proxy?

A Cloudflare Worker that adds payment gating to any origin using the x402 protocol. Users pay to access protected routes, then get a JWT cookie valid for 1 hour.

---

## Deployment Modes

There are three deployment modes. The choice depends on your origin and whether an existing worker already owns the target domain.

### 1. Standard Proxy Mode (DNS-Based)

- x402-proxy owns the route (e.g., `api.example.com/*`)
- All traffic flows through x402-proxy
- Protected paths require payment, others pass through to DNS origin
- **Use when:** Origin is a traditional server (VM, container) with DNS pointing to it

```
User → x402-proxy (owns route) → Origin Server (via Cloudflare DNS)
```

### 2. External Origin Mode

- x402-proxy owns the route and proxies to an external URL
- No code changes needed to the existing worker/service
- **Use when:** Origin is an external API, or an existing worker you don't want to modify

```
User → x402-proxy (owns route) → External Service (via ORIGIN_URL)
```

### 3. Service Binding Mode

- x402-proxy calls the origin worker directly via [Service Binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/)
- Zero network overhead - both workers run on the same thread
- Origin worker doesn't need a public route
- **Use when:** Origin is another Worker in your account and you want optimal performance

```
User → x402-proxy (owns route) → Origin Worker (via Service Binding)
```

---

## Interactive Setup Flow

When a user asks for help setting up x402-proxy, follow this discovery process:

### Step 1: Verify Cloudflare Authentication

```bash
npx wrangler whoami
```

If not logged in, guide them to run `npx wrangler login`.

### Step 2: Discover Existing Workers

```bash
npx wrangler deployments list
```

This shows what workers are already deployed in the account.

### Step 3: Check Existing Routes

```bash
npx wrangler routes list --zone <domain>
```

This reveals if another worker already owns routes on that domain.

**Decision guide:**

| Situation                                   | Recommended Mode       |
| ------------------------------------------- | ---------------------- |
| Origin is traditional server (VM/container) | Standard Proxy Mode    |
| Origin is external API or service           | External Origin Mode   |
| Origin is another Worker in your account    | Service Binding Mode   |
| Existing worker owns `domain/*`             | External Origin Mode\* |

\*For existing workers with source code available, you can use Service Binding Mode for better performance.

### Step 4: Gather Required Config

1. **Wallet address (PAY_TO)?** - Where payments go
2. **Which paths need payment?** - e.g., `/premium/*`, `/api/paid/*`
3. **Price for each path?** - e.g., `$0.01`, `$0.10`
4. **Network?** - `base-sepolia` (testing) or `base` (production)

#### If User Doesn't Have a Wallet Address

They can use the default "dead address" for testing:
`0x000000000000000000000000000000000000dEaD`

For production, they'll need a real wallet:

- [Coinbase Wallet](https://www.coinbase.com/wallet)
- [MetaMask](https://metamask.io)
- [CDP Server Wallet](https://docs.cdp.coinbase.com/server-wallets/v2/introduction/quickstart)

---

## Standard Proxy Mode Setup

Use this when no existing worker owns the target domain.

### Step 1: Configure wrangler.jsonc

```jsonc
{
	"routes": [{ "pattern": "api.example.com/*", "zone_name": "example.com" }],
	"vars": {
		"PAY_TO": "0x000000000000000000000000000000000000dEaD",
		"NETWORK": "base-sepolia",
		"PROTECTED_PATTERNS": [
			{
				"pattern": "/premium/*",
				"price": "$0.01",
				"description": "Premium access for 1 hour",
			},
		],
	},
}
```

### Step 2: Set JWT Secret

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" | npx wrangler secret put JWT_SECRET
```

### Step 3: Deploy

```bash
npm run deploy
```

### Step 4: Verify

```bash
curl https://api.example.com/__x402/health
# Should return: {"status":"ok","timestamp":...}
```

---

## External Origin Mode Setup

Use this when an existing worker already owns the domain and you don't want to modify its code.

### Step 1: Find the Existing Worker's workers.dev URL

```bash
npx wrangler deployments list
```

Look for the existing worker's name. Its URL will be: `https://<worker-name>.<account>.workers.dev`

### Step 2: Remove the Route from the Existing Worker

Edit the existing worker's `wrangler.toml` or `wrangler.jsonc` to remove/comment out the route, then redeploy it:

```bash
npx wrangler deploy
```

The worker is now only accessible via its `workers.dev` URL.

### Step 3: Configure x402-proxy with ORIGIN_URL

```jsonc
{
	"routes": [{ "pattern": "api.example.com/*", "zone_name": "example.com" }],
	"vars": {
		"ORIGIN_URL": "https://my-existing-worker.myaccount.workers.dev",
		"PAY_TO": "0x000000000000000000000000000000000000dEaD",
		"NETWORK": "base-sepolia",
		"PROTECTED_PATTERNS": [
			{
				"pattern": "/premium/*",
				"price": "$0.01",
				"description": "Premium access for 1 hour",
			},
		],
	},
}
```

### Step 4: Set JWT Secret and Deploy

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" | npx wrangler secret put JWT_SECRET
npm run deploy
```

### Step 5: Verify

```bash
curl https://api.example.com/__x402/health
curl https://api.example.com/premium/content  # Should return 402
curl https://api.example.com/public/content   # Should proxy to original worker
```

---

## Service Binding Mode Setup

Use this when the origin is another Worker in your account and you want the fastest possible performance.

### Step 1: Ensure Origin Worker is Deployed

The origin worker must be deployed to your account. It doesn't need any routes - Service Bindings work without public access.

```bash
npx wrangler deployments list
```

### Step 2: Configure x402-proxy with Service Binding

```jsonc
{
	"routes": [{ "pattern": "api.example.com/*", "zone_name": "example.com" }],
	"services": [{ "binding": "ORIGIN_SERVICE", "service": "my-origin-worker" }],
	"vars": {
		"PAY_TO": "0x000000000000000000000000000000000000dEaD",
		"NETWORK": "base-sepolia",
		"PROTECTED_PATTERNS": [
			{
				"pattern": "/premium/*",
				"price": "$0.01",
				"description": "Premium access for 1 hour",
			},
		],
	},
}
```

**Key points:**

- `binding`: Must be `"ORIGIN_SERVICE"` (this is what x402-proxy looks for)
- `service`: The deployed name of your origin worker

### Step 3: Set JWT Secret and Deploy

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" | npx wrangler secret put JWT_SECRET
npm run deploy
```

### Step 4: Verify

```bash
curl https://api.example.com/__x402/health
curl https://api.example.com/__x402/config
# Should show: "hasOriginService": true
```

---

## Route Migration

When switching between modes, you may encounter route ownership conflicts.

### Understanding Route Ownership

- Routes can only be owned by one worker at a time
- A route must be deleted from the old worker before the new worker can claim it
- Custom domains and routes are different mechanisms (check which one your worker uses)

### Migrating Routes Between Workers

**Via wrangler.jsonc:** Remove the route from the old worker's config and redeploy.

**Via Dashboard:**

1. Go to Workers & Pages → your worker
2. Click "Triggers" tab
3. Remove the route

See [Workers Routes documentation](https://developers.cloudflare.com/workers/configuration/routing/routes/) for more details.

### Order of Operations to Minimize Downtime

1. Deploy new worker (without routes) and verify it works via `workers.dev`
2. Delete route from old worker
3. Immediately redeploy new worker with routes

---

## Configuration Reference

### Required Variables

| Variable             | Description                                      |
| -------------------- | ------------------------------------------------ |
| `PAY_TO`             | Wallet address to receive payments               |
| `NETWORK`            | `"base-sepolia"` (test) or `"base"` (production) |
| `JWT_SECRET`         | Secret for signing tokens (64 hex chars)         |
| `PROTECTED_PATTERNS` | Array of `{pattern, price, description}`         |

### Optional Variables

| Variable          | Description                                         |
| ----------------- | --------------------------------------------------- |
| `ORIGIN_URL`      | External URL to proxy to (for External Origin Mode) |
| `ORIGIN_SERVICE`  | Service Binding to origin Worker                    |
| `FACILITATOR_URL` | Payment facilitator (defaults to CDP)               |

### Debug Endpoints

- `/__x402/health` - Health check
- `/__x402/config` - Current config (no secrets exposed)
- `/__x402/protected` - Test payment flow ($0.01)

### Origin Auto-Detection

x402-proxy automatically detects how to reach the origin:

| Priority | Config Present           | How it works                      |
| -------- | ------------------------ | --------------------------------- |
| 1        | `ORIGIN_SERVICE` binding | Calls bound Worker directly       |
| 2        | `ORIGIN_URL` set         | Rewrites URL to that origin       |
| 3        | Neither                  | Uses `fetch()` via Cloudflare DNS |

---

## Common Issues

### "A route with the same pattern already exists" [code: 10020]

Another worker owns this route. You must delete the route from that worker first, then redeploy.

**To fix:**

1. Identify which worker owns the route: `npx wrangler routes list --zone <domain>`
2. Remove the route from the existing worker (see [Route Migration](#route-migration))
3. Redeploy x402-proxy with that route

**Alternative:** Use External Origin Mode instead - keep the existing worker's route and set `ORIGIN_URL` to its `workers.dev` URL.

### "Connection timed out" (522) after deploying

x402-proxy is intercepting traffic but has no origin to proxy to. This happens when:

- `ORIGIN_URL` is not set and there's no DNS origin
- The origin server is not reachable
- You're using routes without configuring an origin

**To fix:**

- Set `ORIGIN_URL` to point to an actual backend
- Use Service Binding Mode instead
- Ensure DNS records point to a real origin server (orange cloud enabled)

### Origin not reachable

- **DNS Proxy**: Check DNS records point to origin, domain is proxied (orange cloud)
- **External URL**: Check `ORIGIN_URL` is correct and accessible
- **Service Binding**: Check Worker name in `services` config matches deployed Worker

### Payment works but content fails

The origin is the problem, not x402-proxy. Test origin directly:

- For External Origin: `curl https://my-worker.myaccount.workers.dev/path`
- For DNS Proxy: Check your origin server logs

### Cookies not persisting

- Must be HTTPS (cookies have `Secure` flag)
- Check `SameSite=Strict` compatibility with your frontend
- Cookies are valid for 1 hour after payment

### "JWT_SECRET not set" (500) on protected routes

The secret wasn't configured. Run:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" | npx wrangler secret put JWT_SECRET
```

### Homepage shows x402 landing page instead of origin content

The template includes static assets in the `public/` directory for standalone demos. When proxying to an origin, these must be disabled.

**Fix:** Comment out or remove the `assets` configuration in `wrangler.jsonc`:

```jsonc
// "assets": { "directory": "public" },
```

---

## Testing Locally

```bash
cp .dev.vars.example .dev.vars
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))" >> .dev.vars
npm run dev

curl http://localhost:8787/__x402/health      # Should return 200
curl http://localhost:8787/__x402/protected   # Should return 402
```

---

## Architecture

```
User Request → x402-proxy (owns route)
                    |
              Is path in PROTECTED_PATTERNS?
              /              \
            No               Yes
             |                |
       Proxy to          Check cookie/payment
       origin                 |
                       Valid? → Proxy + set cookie
                       Invalid? → Return 402
```

**Cookie flow after payment:**

1. User requests protected path without valid cookie
2. x402-proxy returns 402 with payment requirements
3. User submits payment via X-PAYMENT header
4. x402 middleware verifies payment with facilitator
5. x402-proxy generates JWT, sets cookie, proxies to origin
6. Subsequent requests include cookie - no payment needed for 1 hour

---

## Pre-Deploy Checklist

Before running `npm run deploy`, verify:

- [ ] `account_id` set in wrangler.jsonc (required if user has multiple Cloudflare accounts)
- [ ] `assets` configuration commented out or removed (required when proxying to an origin)
- [ ] Origin worker name is correct in `services` config (for Service Binding mode)
- [ ] `JWT_SECRET` has been created via `npx wrangler secret put JWT_SECRET`
- [ ] `PROTECTED_PATTERNS` configured with correct paths and prices
- [ ] `routes` configured with correct pattern and zone_name

---

## Additional Resources

- [Workers Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/) - Route configuration and management
- [Service Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/) - Worker-to-Worker communication
- [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) - Alternative to routes
- [Wrangler Commands](https://developers.cloudflare.com/workers/wrangler/commands/) - CLI reference for discovery
