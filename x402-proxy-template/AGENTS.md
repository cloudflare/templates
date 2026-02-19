# x402-proxy Setup Guide for AI Agents

Context for AI coding agents to help users set up x402-proxy for payment-gated content.

## What is x402-proxy?

A Cloudflare Worker that adds payment gating to any origin using the x402 protocol. Users pay to access protected routes, then get a JWT cookie valid for 1 hour.

**With Bot Management Filtering:** Requires Bot Management for Enterprise to enable bot filtering. With it enabled, x402-proxy can implement "default closed" - humans pass through free, only bots must pay. This is optional and enhances the base functionality.

---

## Interactive Setup Flow

When a user asks for help setting up x402-proxy, follow this discovery process:

### Step 1: Verify Cloudflare Authentication

```bash
npx wrangler whoami
```

If not logged in, guide them to run `npx wrangler login`.

If they have multiple accounts, note them for Step 2.

---

### Step 2: Select Domain

Ask: **"Which domain do you want to add payment gating to?"**

If the user has multiple Cloudflare accounts (from Step 1), also ask: **"Which account is this domain on?"**

**Save the domain** - it scopes everything that follows.

---

### Step 3: Check for Bot Management (Optional Enhancement)

Ask: **"Do you have Bot Management enabled on `{domain}`?"**

Explain why you're asking:

> With Bot Management, x402-proxy can implement "default closed" - blocking bot traffic by score threshold while letting humans through automatically. You can also make specific exceptions for bots like Googlebot or verified AI crawlers.
>
> Without Bot Management, x402-proxy still works perfectly - it just charges for protected routes without distinguishing between bots and humans. All traffic to protected routes must pay.

| Answer  | Effect                                            |
| ------- | ------------------------------------------------- |
| **Yes** | Enable Bot Management Filtering prompts in Step 4 |
| **No**  | Skip threshold/exception prompts in Step 4        |

---

### Step 4: Configure Protected Paths (Iterative)

Ask: **"What path on `{domain}` do you want to charge for?"**

If the user provides multiple paths at once, queue them and configure each in sequence.

**For EACH path, ask:**

#### 4.1 Price

Ask: **"What price (in USD) for `{path}`?"**

Format: `$0.01`, `$0.10`, `$1.00`, etc.

#### 4.2 Description

Ask: **"What description for `{path}`?"** (shown to users explaining what they're paying for)

Example: "Access to premium content for 1 hour"

---

#### If User Has Bot Management (from Step 3):

Continue with these additional prompts:

#### 4.3 Bot Score Threshold

Ask: **"What bot score threshold for `{path}`?"**

**ALWAYS offer exactly these three options:**

| Option               | Threshold | What it means                                                  |
| -------------------- | --------- | -------------------------------------------------------------- |
| **1**                | 1         | Very strict - only verified humans pass free                   |
| **2**                | 2         | Strict - only clear human traffic passes free                  |
| **30 (Recommended)** | 30        | Balanced - likely automated traffic must pay, humans pass free |

**Recommended: 30** - This is the typical starting point that blocks likely-automated traffic while letting humans through free.

#### 4.4 Bot Exceptions

Ask: **"Any bots that should get FREE access to `{path}`?"**

**Offer these preset options:**

| Preset                    | Bots Included                                                            | Use When                     |
| ------------------------- | ------------------------------------------------------------------------ | ---------------------------- |
| **Googlebot + BingBot**   | Googlebot, BingBot                                                       | Allow major crawlers         |
| **Above + AI assistants** | Above + ChatGPT-User, Claude-User, Perplexity-User, Meta-ExternalFetcher | Allow AI assistant citations |
| **None**                  | (empty)                                                                  | All bots must pay            |

If the user selects a preset or names specific bots:

1. Look up each bot name in the Bot Registry (see below)
2. Resolve to detection IDs
3. Write to config with inline comments

**Example resolution:**

- User says: "Googlebot and BingBot"
- Agent looks up: Googlebot → 120623194, BingBot → 117479730
- Config output:

```jsonc
"except_detection_ids": [
  120623194,  // Googlebot
  117479730   // BingBot
]
```

---

#### After Configuring Each Path

Ask: **"Any more paths on `{domain}` to protect?"**

- If **yes** → repeat Step 4 for the next path
- If **no** → continue to Step 5

---

### Step 5: Wallet & Network Configuration

Ask these together:

1. **"What wallet address should receive payments (PAY_TO)?"**
2. **"Which network: `base-sepolia` (testing) or `base` (production)?"**

#### If User Doesn't Have a Wallet Address

They can use the default "dead address" for testing:
`0x000000000000000000000000000000000000dEaD`

For production, they'll need a real wallet:

- [Coinbase Wallet](https://www.coinbase.com/wallet)
- [MetaMask](https://metamask.io)
- [CDP Server Wallet](https://docs.cdp.coinbase.com/server-wallets/v2/introduction/quickstart)

---

## Deployment Phase

Now that configuration is complete, discover infrastructure and deploy.

### Step 6: Discover Existing Workers & Routes

```bash
npx wrangler deployments list
npx wrangler routes list --zone {domain}
```

This reveals:

- What workers are already deployed
- If another worker owns routes on the target domain

**Determine deployment mode:**

| Situation                                   | Recommended Mode       |
| ------------------------------------------- | ---------------------- |
| Origin is traditional server (VM/container) | Standard Proxy Mode    |
| Origin is external API or service           | External Origin Mode   |
| Origin is another Worker in your account    | Service Binding Mode   |
| Existing worker owns `domain/*`             | External Origin Mode\* |

\*For existing workers with source code available, you can use Service Binding Mode for better performance.

---

### Step 7: Generate wrangler.jsonc

Based on gathered information, generate the complete configuration.

**Example - Basic (no Bot Management Filtering):**

```jsonc
{
	"routes": [
		{ "pattern": "example.com/premium/*", "zone_name": "example.com" },
	],
	"vars": {
		"PAY_TO": "0x000000000000000000000000000000000000dEaD",
		"NETWORK": "base-sepolia",
		"PROTECTED_PATTERNS": [
			{
				"pattern": "/premium/*",
				"price": "$0.10",
				"description": "Access to premium content for 1 hour",
			},
		],
	},
}
```

**Example - With Bot Management Filtering:**

Requires Bot Management for Enterprise to enable bot filtering.

```jsonc
{
	"routes": [
		{ "pattern": "example.com/premium/*", "zone_name": "example.com" },
	],
	"vars": {
		"PAY_TO": "0x000000000000000000000000000000000000dEaD",
		"NETWORK": "base-sepolia",
		"PROTECTED_PATTERNS": [
			{
				"pattern": "/premium/*",
				"price": "$0.10",
				"description": "Access to premium content for 1 hour",
				"bot_score_threshold": 30,
				"except_detection_ids": [
					120623194, // Googlebot
					117479730, // BingBot
				],
			},
		],
	},
}
```

---

### Step 8: Set JWT Secret

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" | npx wrangler secret put JWT_SECRET
```

---

### Step 9: Deploy

```bash
npm run deploy
```

---

### Step 10: Verify

```bash
curl https://{domain}/__x402/health
# Should return: {"status":"ok","timestamp":...}

curl https://{domain}/__x402/config
# Should show protected patterns and Bot Management Filtering status
```

---

## Deployment Modes

### Standard Proxy Mode (DNS-Based)

- x402-proxy owns the route (e.g., `api.example.com/*`)
- All traffic flows through x402-proxy
- Protected paths require payment, others pass through to DNS origin
- **Use when:** Origin is a traditional server (VM, container) with DNS pointing to it

```
User → x402-proxy (owns route) → Origin Server (via Cloudflare DNS)
```

### External Origin Mode

- x402-proxy owns the route and proxies to an external URL
- No code changes needed to the existing worker/service
- **Use when:** Origin is an external API, or an existing worker you don't want to modify

```
User → x402-proxy (owns route) → External Service (via ORIGIN_URL)
```

**Setup:** Add `ORIGIN_URL` to vars:

```jsonc
"ORIGIN_URL": "https://my-existing-worker.myaccount.workers.dev"
```

### Service Binding Mode

- x402-proxy calls the origin worker directly via [Service Binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/)
- Zero network overhead - both workers run on the same thread
- Origin worker doesn't need a public route
- **Use when:** Origin is another Worker in your account and you want optimal performance

```
User → x402-proxy (owns route) → Origin Worker (via Service Binding)
```

**Setup:** Add services binding:

```jsonc
"services": [{ "binding": "ORIGIN_SERVICE", "service": "my-origin-worker" }]
```

---

## Bot Management Filtering Reference

Requires Bot Management for Enterprise to enable bot filtering. When enabled, users can configure payment exemptions based on bot score and detection IDs.

### How It Works

```
Request arrives at protected route
         │
         ▼
    Bot Management Filtering configured?
    ┌────────┴────────┐
   No                Yes
    │                 │
    ▼                 ▼
 All traffic    Check bot score & exceptions
 must pay            │
                ┌────┴────┐
                │         │
           Human OR    Bot (not excepted)
           Excepted Bot     │
                │           ▼
                ▼      Check cookie/payment
           Pass FREE        │
           to origin   Valid? → Proxy + set cookie
                       Invalid? → Return 402
```

### Bot Score Threshold Reference

| Threshold | Meaning                                                | Use Case                                 |
| --------- | ------------------------------------------------------ | ---------------------------------------- |
| **1**     | Very strict - only verified humans pass free           | Maximum monetization                     |
| **2**     | Strict - only clear human traffic passes free          | High-value APIs                          |
| **30**    | Balanced - likely automated must pay, humans pass free | **Recommended** - typical starting point |

### Bot Registry Reference

When configuring bot exceptions, use this registry to resolve bot names to detection IDs.

**Included operators:** Google, Microsoft, OpenAI, Anthropic, Perplexity, Meta

For additional bots, users can find detection IDs in the Cloudflare dashboard:
AI Crawl Control → Crawlers → Actions menu → Copy detection ID

#### Google

| Bot Name              | Detection ID | Notes              |
| --------------------- | ------------ | ------------------ |
| Googlebot             | 120623194    | Google Search      |
| Google-CloudVertexBot | 133730073    | Google AI training |

#### Microsoft

| Bot Name | Detection ID | Notes          |
| -------- | ------------ | -------------- |
| BingBot  | 117479730    | Microsoft Bing |

#### OpenAI

| Bot Name      | Detection ID | Notes                  |
| ------------- | ------------ | ---------------------- |
| GPTBot        | 123815556    | OpenAI training        |
| ChatGPT-User  | 132995013    | ChatGPT browsing mode  |
| ChatGPT agent | 129220581    | ChatGPT agents/plugins |
| OAI-SearchBot | 126255384    | OpenAI SearchGPT       |

#### Anthropic (Heuristics IDs)

| Bot Name         | Heuristics ID | Notes              |
| ---------------- | ------------- | ------------------ |
| ClaudeBot        | 33563859      | Anthropic training |
| Claude-SearchBot | 33564301      | Anthropic search   |
| Claude-User      | 33564303      | Claude web access  |

#### Perplexity (Heuristics IDs)

| Bot Name        | Heuristics ID | Notes              |
| --------------- | ------------- | ------------------ |
| PerplexityBot   | 33563889      | Perplexity search  |
| Perplexity-User | 33564371      | Perplexity answers |

#### Meta

| Bot Name             | Detection ID           | Notes             |
| -------------------- | ---------------------- | ----------------- |
| Meta-ExternalAgent   | 124581738              | Meta AI training  |
| Meta-ExternalFetcher | 132272919              | Meta AI assistant |
| FacebookBot          | (heuristics: 33563972) | Meta crawling     |

### Example Preset

```jsonc
"except_detection_ids": [
  120623194,  // Googlebot
  117479730,  // BingBot
  132995013,  // ChatGPT-User
  33564303    // Claude-User
]
```

### Finding Custom Detection IDs

If a bot isn't in the registry, the user can find its detection ID in the dashboard:

1. Go to **AI Crawl Control** in Cloudflare dashboard
2. Navigate to **Crawlers**
3. Find the crawler in the list
4. Click the **three dot menu** in the Actions column
5. Copy the detection ID

---

## Configuration Reference

### Required Variables

| Variable             | Description                                      |
| -------------------- | ------------------------------------------------ |
| `PAY_TO`             | Wallet address to receive payments               |
| `NETWORK`            | `"base-sepolia"` (test) or `"base"` (production) |
| `JWT_SECRET`         | Secret for signing tokens (64 hex chars)         |
| `PROTECTED_PATTERNS` | Array of protected route configurations          |

### Protected Pattern Schema

```typescript
{
  pattern: string;              // Route to protect (e.g., "/premium/*")
  price: string;                // Price in USD (e.g., "$0.01")
  description: string;          // Shown to users
  // Bot Management Filtering (optional)
  bot_score_threshold?: number; // 1, 2, or 30
  except_detection_ids?: number[]; // Bot detection IDs to allow free
}
```

### Optional Variables

| Variable          | Description                                         |
| ----------------- | --------------------------------------------------- |
| `ORIGIN_URL`      | External URL to proxy to (for External Origin Mode) |
| `ORIGIN_SERVICE`  | Service Binding to origin Worker                    |
| `FACILITATOR_URL` | Payment facilitator (defaults to CDP)               |

### Debug Endpoints

- `/__x402/health` - Health check
- `/__x402/config` - Current config (no secrets exposed, shows Bot Management Filtering status)
- `/__x402/protected` - Test payment flow ($0.01)

### Origin Auto-Detection

x402-proxy automatically detects how to reach the origin:

| Priority | Config Present           | How it works                      |
| -------- | ------------------------ | --------------------------------- |
| 1        | `ORIGIN_SERVICE` binding | Calls bound Worker directly       |
| 2        | `ORIGIN_URL` set         | Rewrites URL to that origin       |
| 3        | Neither                  | Uses `fetch()` via Cloudflare DNS |

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

### Bot Management Filtering: "cf.botManagement not available"

This warning appears in logs when Bot Management Filtering is configured but Bot Management data isn't present in the request.

**Causes:**

- Bot Management for Enterprise is not enabled
- Request is from local development (Bot Management not available locally)

**Fix:**

- Enable Bot Management for Enterprise in the Cloudflare dashboard
- For local testing, the warning is expected - filtering will work after deployment

### Bot Management Filtering: Humans still getting 402

Check that:

1. `bot_score_threshold` is set (e.g., 30)
2. The request actually has a bot score > threshold
3. Bot Management for Enterprise is enabled

Use `npx wrangler tail` to see bot scores in logs after deployment.

---

## Testing Locally

```bash
cp .dev.vars.example .dev.vars
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))" >> .dev.vars
npm run dev

curl http://localhost:8787/__x402/health      # Should return 200
curl http://localhost:8787/__x402/protected   # Should return 402
```

**Note:** Bot Management data is not available in local development. Bot Management Filtering will only work after deployment to Cloudflare.

---

## Pre-Deploy Checklist

Before running `npm run deploy`, verify:

- [ ] `account_id` set in wrangler.jsonc (required if user has multiple Cloudflare accounts)
- [ ] `assets` configuration commented out or removed (required when proxying to an origin)
- [ ] Origin worker name is correct in `services` config (for Service Binding mode)
- [ ] `JWT_SECRET` has been created via `npx wrangler secret put JWT_SECRET`
- [ ] `PROTECTED_PATTERNS` configured with correct paths and prices
- [ ] `routes` configured with correct pattern and zone_name

**If using Bot Management Filtering:**

- [ ] Bot Management for Enterprise is enabled
- [ ] `bot_score_threshold` is set on relevant patterns (typically 30)
- [ ] `except_detection_ids` are resolved from bot names

---

## Additional Resources

- [Workers Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/) - Route configuration and management
- [Service Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/) - Worker-to-Worker communication
- [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) - Alternative to routes
- [Wrangler Commands](https://developers.cloudflare.com/workers/wrangler/commands/) - CLI reference for discovery
- [x402 Protocol](https://x402.org) - Payment protocol specification
- [Bot Management](https://developers.cloudflare.com/bots/) - Cloudflare Bot Management documentation
