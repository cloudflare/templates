# x402 Payment-Gated Proxy

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/x402-proxy-template)

A Cloudflare Worker that acts as a transparent proxy with payment-gated access using the [x402 protocol](https://x402.org) and stateless cookie-based authentication.

**Live Demo** - Try the built-in endpoints (other routes will fail as no origin is configured):

- [/\_\_x402/health](https://x402proxy-template.news.eti.cfdata.org/__x402/health) - Public health check (200 OK)
- [/\_\_x402/protected](https://x402proxy-template.news.eti.cfdata.org/__x402/protected) - Protected endpoint (402 Payment Required)

<!-- dash-content-start -->

## Overview

This template implements a **smart proxy** that:

1. **Forwards all requests** to the origin server by default
2. **Intercepts protected routes** based on configurable patterns
3. **Requires payment** via the x402 protocol for protected routes
4. **Issues JWT cookies** valid for 1 hour after payment
5. **Allows access** to protected routes without additional payments during the valid period

> **Note:** This template is configured for Base Sepolia testnet. For production, update `NETWORK` in `wrangler.jsonc` to a mainnet network (e.g., `"base"`).

### Use Cases

This proxy is ideal for:

- **API Monetization** - Charge per API request or time-based access
- **Premium Content** - Paywall specific routes without modifying your backend
- **Rate Limiting with Payments** - Convert rate limits into paid tiers
- **Microservice Access Control** - Add payment gates to existing services
- **Demo/Testing Payment Flows** - Prototype payment-gated services quickly

### Key Features

- 🔄 **Transparent Proxy** - Forwards all non-protected requests unchanged
- 🎯 **Pattern-Based Protection** - Configure which routes require payment
- 🔐 **Stateless Authentication** - JWT cookies with HMAC-SHA256 signatures
- 💰 **x402 Protocol Integration** - Accept crypto payments for access
- 🍪 **Cookie-Based Sessions** - No server-side storage required
- ⚡ **Edge Computing** - Runs on Cloudflare Workers at the edge
- 🔒 **Secure** - HttpOnly, Secure, SameSite cookies
- 📦 **Lightweight** - Minimal overhead, custom JWT implementation (~2-3 KB)

## Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       ▼
┌──────────────────────────────────────────┐
│  Cloudflare Worker (x402 Proxy)          │
│                                          │
│  ┌────────────────────────────────┐     │
│  │  Pattern Matcher               │     │
│  │  Is path protected?            │     │
│  └────────┬──────────────┬────────┘     │
│           │ NO           │ YES          │
│           ▼              ▼              │
│  ┌────────────┐  ┌──────────────────┐  │
│  │ Pass       │  │ Auth Middleware  │  │
│  │ Through    │  │ • Check cookie   │  │
│  └────────────┘  │ • Verify payment │  │
│                  │ • Issue cookie   │  │
│                  └──────────────────┘  │
│                           │             │
└───────────────────────────┼─────────────┘
                            ▼
                  ┌──────────────────┐
                  │  Origin Server   │
                  │  (Your Backend)  │
                  └──────────────────┘
```

<!-- dash-content-end -->

## Quick Start

Get up and running in under 2 minutes:

```bash
# Install dependencies
npm install

# Configure JWT secret for local development
cp .dev.vars.example .dev.vars
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))" >> .dev.vars

# Start the dev server
npm run dev
```

Visit `http://localhost:8787` to see the proxy in action.

- Try `http://localhost:8787/__x402/health` for a public endpoint
- Try `http://localhost:8787/__x402/protected` to see payment requirements

## Getting Started

> _Already ran Quick Start above? Skip to [How It Works](#how-it-works)._

### Prerequisites

- Node.js 18+
- npm or yarn
- Cloudflare account (for deployment)
- A wallet address to receive payments (see [Getting a Wallet Address](#getting-a-wallet-address) below)
- Testnet tokens for testing payments (get from [CDP Faucet](https://docs.cdp.coinbase.com/faucets/introduction/welcome))

### Getting a Wallet Address

You need a wallet address (`PAY_TO`) to receive payments. Any Ethereum-compatible wallet works—use an existing wallet (MetaMask, Coinbase Wallet, etc.) or create one programmatically with [Coinbase Developer Platform](https://docs.cdp.coinbase.com/server-wallets/v2/introduction/quickstart).

### Installation

```bash
npm install
```

### Configuration

#### Configuration Options

The proxy is configured via environment variables in `wrangler.jsonc`:

| Variable             | Required | Description                                    | Example                          |
| -------------------- | -------- | ---------------------------------------------- | -------------------------------- |
| `PAY_TO`             | Yes      | Wallet address to receive payments             | `"0x..."`                        |
| `NETWORK`            | Yes      | Blockchain network for payments                | `"base-sepolia"` or `"base"`     |
| `JWT_SECRET`         | Yes      | Secret for signing auth tokens (set as secret) | (64 hex chars)                   |
| `PROTECTED_PATTERNS` | Yes      | Array of route pricing configurations          | See below                        |
| `ORIGIN_URL`         | No       | External URL to proxy to (if not using DNS)    | `"https://api.example.com"`      |
| `ORIGIN_SERVICE`     | No       | Service Binding to origin Worker               | Configured in wrangler.jsonc     |
| `FACILITATOR_URL`    | No       | x402 facilitator endpoint (defaults to CDP)    | `"https://x402.org/facilitator"` |

#### PROTECTED_PATTERNS

Each entry defines a protected route and its payment requirements:

```jsonc
"PROTECTED_PATTERNS": [
  {
    "pattern": "/premium/*",
    "price": "$0.01",
    "description": "Access to premium content for 1 hour"
  },
  {
    "pattern": "/api/pro/*",
    "price": "$0.10",
    "description": "Pro API access"
  }
]
```

#### Proxy Modes

The proxy supports three modes for routing requests to your backend. Choose based on your architecture:

##### DNS-Based Mode (Default)

**Best for:** Traditional backend servers (VMs, containers, other hosting providers)

When `ORIGIN_URL` is **not set**, requests are forwarded to the origin server defined in your Cloudflare DNS records.

**Setup:**

1. Add a DNS record in Cloudflare pointing to your origin server:
   - Type: `A` (for IP address) or `CNAME` (for hostname)
   - Name: `api` (or your subdomain)
   - Content: Your origin server IP or hostname
   - Proxy status: **Proxied** (orange cloud)

2. Configure a route in `wrangler.jsonc`:

   ```jsonc
   "routes": [
     { "pattern": "api.example.com/*", "zone_name": "example.com" }
   ]
   ```

3. Deploy. The proxy will forward requests to your origin server automatically.

```
User → api.example.com → x402 Proxy → Origin Server (via DNS)
```

##### External Origin Mode

**Best for:** Another Cloudflare Worker, or any external service with a public URL

When `ORIGIN_URL` **is set**, requests are rewritten to that URL. This lets you proxy to another Worker on a Custom Domain or any external API.

**Setup:**

1. Set `ORIGIN_URL` in `wrangler.jsonc`:

   ```jsonc
   "vars": {
     "ORIGIN_URL": "https://my-origin-worker.example.com",
     // ... other vars
   }
   ```

2. If your origin is a Worker, deploy it with a [Custom Domain](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

3. Deploy the proxy. Requests are rewritten to the origin URL while preserving the original `Host` header.

```
User → api.example.com → x402 Proxy → my-origin-worker.example.com (URL rewrite)
```

**Why External Origin mode?** Cloudflare routes a hostname to one Worker only. You can't chain Workers on the same hostname via routing. External Origin mode solves this by rewriting the URL to a different hostname where your origin Worker lives.

##### Service Binding Mode

**Best for:** Another Cloudflare Worker in your account (fastest option)

When `ORIGIN_SERVICE` **is bound**, requests are sent directly to the bound Worker with zero network overhead. Both Workers run on the same thread.

**Setup:**

1. Add a service binding in `wrangler.jsonc`:

   ```jsonc
   "services": [
     { "binding": "ORIGIN_SERVICE", "service": "my-origin-worker" }
   ]
   ```

2. Deploy. The proxy will call the origin Worker directly via the binding.

```
User → api.example.com → x402 Proxy → Origin Worker (via Service Binding)
```

**Why Service Binding mode?** [Service Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/) provide the fastest Worker-to-Worker communication with no network hop. The origin Worker doesn't even need a public route.

##### Quick Comparison

| Mode            | Config           | Origin Type           | Use Case                                          |
| --------------- | ---------------- | --------------------- | ------------------------------------------------- |
| DNS-Based       | (default)        | Traditional server    | Your backend is a VM, container, or external host |
| External Origin | `ORIGIN_URL`     | Worker or any URL     | Your backend is another Worker or external API    |
| Service Binding | `ORIGIN_SERVICE` | Worker (same account) | Fastest option for Worker-to-Worker               |

#### Local Development Setup

1. **Copy the example environment file:**

   ```bash
   cp .dev.vars.example .dev.vars
   ```

2. **Generate a secure JWT secret:**

   ```bash
   node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))" >> .dev.vars
   ```

3. **Verify your `.dev.vars` file contains:**
   ```bash
   JWT_SECRET=<your-generated-secret>
   ```

### Development

Start the development server:

```bash
npm run dev
```

The server will be available at `http://localhost:8787`

### Available Scripts

**Most commonly used:**

| Command          | Description                    |
| ---------------- | ------------------------------ |
| `npm run dev`    | Start local development server |
| `npm run deploy` | Deploy to Cloudflare Workers   |

**Other scripts:**

| Command                | Description                                  |
| ---------------------- | -------------------------------------------- |
| `npm run cf-typegen`   | Generate TypeScript types from Worker config |
| `npm run typecheck`    | Run TypeScript type checking                 |
| `npm run format`       | Format code with Prettier                    |
| `npm run format:check` | Check code formatting                        |
| `npm run lint`         | Run all checks (typecheck + format + ESLint) |
| `npm run lint:fix`     | Auto-fix formatting and linting issues       |
| `npm run test:client`  | Run automated end-to-end test                |

## How It Works

### Key Implementation Details

Understanding the core concepts will help you configure and use this proxy effectively.

#### Stateless JWT Authentication

The proxy uses a custom JWT implementation built on Web Crypto API:

- **Signing:** HMAC-SHA256 with secret key
- **Payload:** `{ paid: true, iat, exp }`
- **Validation:** Signature verification + expiration check
- **Size:** ~2-3 KB minified (no dependencies)

#### Payment Flow

1. Client requests protected route (e.g., `/premium`) without cookie
2. Proxy responds with `402 Payment Required` + payment details
3. Client creates signed payment (e.g., for USDC on Base Sepolia)
4. Client retries request with `X-PAYMENT` header
5. x402 middleware verifies payment via facilitator
6. Proxy issues JWT cookie + forwards request to origin
7. Subsequent requests use cookie (valid for 1 hour) - no payment needed
8. Origin server receives authenticated requests transparently

**Key insight:** The origin server never knows about the payment logic. It just receives authenticated requests as if the proxy wasn't there.

### Proxy Behavior

The worker acts as a **transparent proxy** that forwards all requests to your origin server, except for routes matching the `PROTECTED_PATTERNS` configuration.

### Public Routes (Default)

Any route NOT in `PROTECTED_PATTERNS` is forwarded directly to the origin:

```bash
curl https://your-worker.dev/any-path
# → Proxied directly to origin server
```

### Protected Routes

Routes matching `PROTECTED_PATTERNS` require payment or a valid authentication cookie:

**Without payment or cookie:**

- Returns `402 Payment Required`
- Includes payment requirements in response body

**With valid payment:**

- Verifies payment via x402 facilitator
- Issues JWT cookie (valid for 1 hour)
- Proxies request to origin server

**With valid cookie:**

- Validates JWT signature and expiration
- Proxies request to origin immediately (no payment required)

### Example: `/premium` endpoint

```bash
# First request without auth
curl https://your-worker.dev/premium
# → 402 Payment Required

# Request with payment
curl https://your-worker.dev/premium -H "X-PAYMENT: <encoded-payment>"
# → Cookie issued + request proxied to origin

# Subsequent requests with cookie
curl https://your-worker.dev/premium -H "Cookie: auth_token=..."
# → Proxied to origin (no payment needed)
```

## Testing

### Automated Testing

Run the automated test client:

```bash
PRIVATE_KEY=0x... npm run test:client
```

This will:

1. Request `/premium` without payment (receives 402)
2. Create and sign a payment with your wallet
3. Submit payment and receive premium content
4. Extract JWT cookie
5. Test cookie authentication (no payment needed)

See [TESTING.md](./TESTING.md) for detailed testing instructions.

### Manual Testing with curl

1. **Test public endpoint:**

```bash
curl http://localhost:8787/__x402/health
```

2. **Request protected endpoint (no payment):**

```bash
curl -v http://localhost:8787/__x402/protected
# Returns 402 with payment requirements
```

3. **Request with payment (requires x402 SDK):**
   See test-client.ts for implementation example

> **Note:** Automated testing with `npm run test:client` requires a funded wallet with testnet tokens. If you're just evaluating the template, the Playwright tests (`pnpm test:e2e x402-proxy-template` from repo root) cover core functionality without requiring payments.

## Project Structure

```
.
├── src/
│   ├── index.ts          # Main application and routes
│   ├── auth.ts           # Authentication middleware
│   └── jwt.ts            # JWT utilities (sign/verify)
├── public/
│   └── index.html        # Static assets
├── test-client.ts        # Automated test client
├── wrangler.jsonc        # Cloudflare Worker configuration
├── .dev.vars             # Local environment variables (gitignored)
├── .prettierrc           # Prettier configuration
├── eslint.config.js      # ESLint configuration
└── tsconfig.json         # TypeScript configuration
```

## Advanced Configuration

### Proxy Architecture

The worker uses a single catch-all middleware that:

1. **Checks path** against `PROTECTED_PATTERNS`
2. **For unprotected paths**: Proxies request immediately to origin
3. **For protected paths**:
   - Checks for valid JWT cookie
   - If no valid cookie, requires x402 payment
   - Issues JWT cookie on successful payment
   - Proxies authenticated request to origin

The proxy mode (DNS-based, External Origin, or Service Binding) determines how requests reach your backend. See [Proxy Modes](#proxy-modes) for details.

### Configuration Examples

**Single route with one price:**

```jsonc
"PROTECTED_PATTERNS": [
  {
    "pattern": "/premium",
    "price": "$0.01",
    "description": "Access to premium content for 1 hour"
  }
]
```

**Multiple routes with different prices:**

```jsonc
"PROTECTED_PATTERNS": [
  {
    "pattern": "/premium",
    "price": "$0.01",
    "description": "Basic premium access"
  },
  {
    "pattern": "/api/pro/*",
    "price": "$0.10",
    "description": "Pro API access"
  },
  {
    "pattern": "/dashboard",
    "price": "$1.00",
    "description": "Full dashboard access"
  }
]
```

**Wildcard patterns:**

```jsonc
"PROTECTED_PATTERNS": [
  {
    "pattern": "/api/private/*",
    "price": "$0.05",
    "description": "Private API access"
  }
]
```

## Security Considerations

### Cookie Security

Cookies are configured with security best practices:

- `HttpOnly`: Prevents JavaScript access (XSS protection)
- `Secure`: HTTPS only in production
- `SameSite=Strict`: CSRF protection
- 1-hour expiration: Limits exposure window

### JWT Security

- Secret key stored in environment variables (not in code)
- HMAC-SHA256 cryptographic signing
- Expiration validation on every request
- No sensitive data in payload

### Payment Security

- All payments verified through facilitator
- Client cannot forge payment proofs
- Payment amount validation
- Network/token validation

## Deployment

### Production Deployment

> **Important:** For production, update `NETWORK` in `wrangler.jsonc` to a mainnet network (e.g., `"base"`).

1. **Set up secrets:**

```bash
wrangler secret put JWT_SECRET
# Enter your production JWT secret
```

2. **Update configuration:**
   Edit `wrangler.jsonc` with your production wallet address and mainnet network

3. **Deploy:**

```bash
npm run deploy
```

### Environment-Specific Configuration

For multiple environments (dev/staging/prod), use [Wrangler environments](https://developers.cloudflare.com/workers/wrangler/configuration/#environments).

## Development

### Code Quality

The project enforces code quality through:

- **TypeScript** - Full type safety
- **ESLint** - Code quality rules
- **Prettier** - Consistent formatting
- **Pre-commit checks** - All checks run via `npm run lint`

### Adding New Protected Routes

Simply add a new entry to `PROTECTED_PATTERNS` in `wrangler.jsonc`:

```jsonc
{
	"vars": {
		"PROTECTED_PATTERNS": [
			{
				"pattern": "/premium",
				"price": "$0.01",
				"description": "Premium content access",
			},
			{
				"pattern": "/api/private/*",
				"price": "$0.05",
				"description": "Private API access",
			},
			{
				"pattern": "/dashboard",
				"price": "$0.10",
				"description": "Dashboard access",
			},
		],
	},
}
```

**That's it!** No code changes needed. The proxy will automatically:

- Require payment for routes matching any pattern
- Apply the correct price for each route
- Issue cookies after payment
- Forward authenticated requests to your origin server

## Troubleshooting

### "Invalid payment" error

- Check wallet has enough testnet tokens
- Verify you're on Base Sepolia network
- Ensure payment amount matches requirement

### Cookie doesn't work

- Check cookie isn't expired (1 hour validity)
- Verify JWT_SECRET is set in `.dev.vars`
- Ensure cookie is being sent in request headers

### TypeScript errors

- Run `npm run cf-typegen` to regenerate types after changing `wrangler.jsonc`
- Check `tsconfig.json` includes correct files

## Resources

- [x402 Protocol Documentation](https://x402.gitbook.io/x402)
- [x402 GitHub](https://github.com/coinbase/x402) - Open source repository
- [CDP Server Wallet Quickstart](https://docs.cdp.coinbase.com/server-wallets/v2/introduction/quickstart) - Create wallets programmatically
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Service Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/) - Worker-to-Worker communication
- [Base Sepolia Testnet](https://docs.base.org/network-information/#base-testnet-sepolia)

## License

This project is provided as-is for educational and demonstration purposes.

## Contributing

This is a demonstration project. For questions or issues, please refer to the [x402 Discord](https://discord.gg/invite/cdp).
