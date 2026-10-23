# Spraay x402 Batch Payments Worker

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/spraay-x402-batch-template)

A Cloudflare Worker that lets AI agents and apps pay multiple recipients in a single on-chain transaction using [x402](https://x402.org) and [Spraay](https://spraay.app)'s batch payment contract on Base.

<!-- dash-content-start -->

## Overview

This template exposes **batch payment endpoints** behind an x402 paywall. Callers get a free fee estimate, pay a small x402 fee, and receive an **unsigned transaction** for Spraay's batch contract. They sign and broadcast it with their own wallet, so the Worker never holds keys or funds.

Where [`x402-proxy-template`](https://github.com/cloudflare/templates/tree/main/x402-proxy-template) shows payment-gated _access_, this template shows payment-gated _action_: payroll, airdrops, revenue sharing and multi-party settlements in one transaction.

> **Note:** x402 fees are settled on Base Sepolia testnet by default. The batch transactions the Worker builds always target Base mainnet (chain ID `8453`), where the Spraay contract is deployed.

## How it works

```
Client                         Worker                         Base mainnet
  │  POST /batch/estimate (free)  │                                │
  │──────────────────────────────▶│  totals + 0.3% fee             │
  │◀──────────────────────────────│                                │
  │  POST /batch/execute          │                                │
  │──────────────────────────────▶│  402 Payment Required          │
  │◀──────────────────────────────│                                │
  │  POST /batch/execute          │                                │
  │  + X-PAYMENT header           │  verify + settle via           │
  │──────────────────────────────▶│  x402 facilitator              │
  │  unsigned tx {to,data,value,  │                                │
  │  chainId,gasLimit}            │                                │
  │◀──────────────────────────────│                                │
  │  sign + broadcast ────────────┼───────────────────────────────▶│ Spraay contract
```

1. **Estimate** - `POST /batch/estimate` validates the batch and returns the total, the Spraay fee and the total including fee.
2. **Pay** - `POST /batch/execute` (or `/batch/equal`) without payment returns `402 Payment Required` with x402 payment requirements. An x402 client such as [`x402-fetch`](https://www.npmjs.com/package/x402-fetch) pays and retries automatically.
3. **Build** - After the payment is verified, the Worker ABI-encodes a `sprayETH`, `sprayToken` or `sprayEqual` call and returns the unsigned transaction. A JWT cookie lets browser clients make further calls for one hour without paying again.
4. **Sign and broadcast** - The caller signs the transaction with their wallet and sends it to Base. For ERC-20 batches, the caller must first approve the Spraay contract for `totalWithFee` (the response includes an `approvalRequired` hint).

## Endpoints

| Method | Path              | Auth   | Description                                                |
| ------ | ----------------- | ------ | ---------------------------------------------------------- |
| GET    | `/health`         | Public | Health check                                               |
| GET    | `/info`           | Public | Contract info, supported operations and config warnings    |
| POST   | `/batch/estimate` | Public | Estimate fees and totals for a batch                       |
| POST   | `/batch/execute`  | x402   | Build an unsigned `sprayETH` / `sprayToken` transaction    |
| POST   | `/batch/equal`    | x402   | Build an unsigned `sprayEqual` (equal amounts) transaction |

Request bodies are validated before payment is requested, so callers are never charged for an invalid batch.

### `POST /batch/estimate` and `POST /batch/execute`

```json
{
	"token": "ETH",
	"recipients": [
		"0x1111111111111111111111111111111111111111",
		"0x2222222222222222222222222222222222222222"
	],
	"amounts": ["1000000000000000", "2000000000000000"],
	"from": "0xYourSenderAddress"
}
```

- `token` - an ERC-20 contract address, or `"ETH"` for native ETH
- `amounts` - raw base units as strings (e.g. `"1000000"` = 1 USDC)
- `from` - optional; when set, the Worker estimates gas with `eth_estimateGas` against `BASE_RPC_URL`, otherwise it uses a conservative heuristic

`/batch/estimate` returns:

```json
{
	"totalAmount": "3000000000000000",
	"feeAmount": "9000000000000",
	"totalWithFee": "3009000000000000",
	"recipientCount": 2,
	"token": "ETH",
	"spraayContract": "0x1646452F98E36A3c9Cfc3eDD8868221E207B5eEC"
}
```

`/batch/execute` returns the unsigned transaction plus the same estimate:

```json
{
	"transaction": {
		"to": "0x1646452F98E36A3c9Cfc3eDD8868221E207B5eEC",
		"data": "0x...",
		"value": "3009000000000000",
		"chainId": 8453,
		"gasLimit": "130000"
	},
	"gasEstimateSource": "heuristic",
	"estimate": { "...": "..." },
	"approvalRequired": null
}
```

### `POST /batch/equal`

```json
{
	"token": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
	"recipients": ["0x1111...", "0x2222..."],
	"amountPerRecipient": "1000000"
}
```

Builds a `sprayEqual(token, recipients, amountPerRecipient)` call. For ETH, the token argument is `address(0)` and `value` is the total including fee.

## Spraay contract

| Property       | Value                                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Address        | [`0x1646452F98E36A3c9Cfc3eDD8868221E207B5eEC`](https://basescan.org/address/0x1646452F98E36A3c9Cfc3eDD8868221E207B5eEC) |
| Chain          | Base mainnet (chain ID `8453`)                                                                                          |
| Fee            | 0.3% (30 bps) of the batch total                                                                                        |
| Max recipients | 200 per transaction                                                                                                     |
| Functions      | `sprayETH`, `sprayToken`, `sprayEqual`                                                                                  |

<!-- dash-content-end -->

## Configuration

All configuration lives in `wrangler.jsonc` under `vars`:

| Variable          | Description                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| `PAY_TO`          | Wallet that receives x402 payments. **Replace the zero-address placeholder with your own wallet.** |
| `NETWORK`         | Network for x402 settlement: `base-sepolia` for testing, `base` for production                     |
| `FACILITATOR_URL` | x402 facilitator that verifies and settles payments (default `https://x402.org/facilitator`)       |
| `BATCH_PRICE`     | Price in USD per paid call, e.g. `$0.01`                                                           |
| `SPRAAY_CONTRACT` | Spraay batch contract on Base mainnet                                                              |
| `BASE_RPC_URL`    | Base mainnet RPC used for gas estimation. The public endpoint is rate limited; use your own.       |

### Secrets

| Secret       | Description                                                                                                                             |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `JWT_SECRET` | Signs the session cookie issued after payment. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

If `JWT_SECRET` is missing, paid endpoints return a 500 explaining the problem and `/info` lists it under `warnings`.

## Getting started

### Local development

```bash
npm install

# Create local secrets
cp .dev.vars.example .dev.vars
# Generate a secret and paste it into .dev.vars as JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

npm run dev
```

Open [http://localhost:8787](http://localhost:8787) for the demo UI, or call the API directly:

```bash
curl http://localhost:8787/health

curl -X POST http://localhost:8787/batch/estimate \
  -H "Content-Type: application/json" \
  -d '{"token":"ETH","recipients":["0x1111111111111111111111111111111111111111"],"amounts":["1000000000000000"]}'

# Returns 402 Payment Required with x402 payment requirements
curl -i -X POST http://localhost:8787/batch/execute \
  -H "Content-Type: application/json" \
  -d '{"token":"ETH","recipients":["0x1111111111111111111111111111111111111111"],"amounts":["1000000000000000"]}'
```

### Paying from code

```ts
import { wrapFetchWithPayment } from "x402-fetch";
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const fetchWithPayment = wrapFetchWithPayment(fetch, account);

const response = await fetchWithPayment(
	"https://<your-worker>.workers.dev/batch/execute",
	{
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ token: "ETH", recipients, amounts }),
	}
);
const { transaction } = await response.json();
// Sign and broadcast `transaction` on Base with your wallet client
```

### Tests

```bash
npm test
```

### Deployment

```bash
npx wrangler secret put JWT_SECRET
npm run deploy
```

Before accepting real payments, set `PAY_TO` to your wallet and `NETWORK` to `base`.

## Cloudflare products used

- [Workers](https://developers.cloudflare.com/workers/) - runs the API at the edge
- [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/) - serves the demo UI in `public/`
- [Secrets](https://developers.cloudflare.com/workers/configuration/secrets/) - stores `JWT_SECRET`

## Links

- [Spraay docs](https://docs.spraay.app)
- [Spraay batch contract on Basescan](https://basescan.org/address/0x1646452F98E36A3c9Cfc3eDD8868221E207B5eEC)
- [x402 protocol](https://x402.org)
- [Cloudflare Workers docs](https://developers.cloudflare.com/workers/)
