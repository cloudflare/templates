# Testing Guide

This guide explains how to test the x402 v2 payment flow with cookie-based authentication.

## Prerequisites

Before testing, you need:

1. **Testnet USDC**
   - Get Base Sepolia USDC and/or Solana devnet USDC from the [Circle faucet](https://faucet.circle.com)
   - The EVM payer needs no testnet ETH because the EIP-3009 payment is signed offline
   - The Solana payer needs no SOL because `extra.feePayer` sponsors the fee
   - The facilitator submits the transaction

2. **A test wallet with a private key**
   - Create a test wallet (DO NOT use a wallet with real funds)
   - Export the EVM and/or Solana private key
   - Fund it with testnet USDC on the network you want to test

3. **The worker running locally**
   ```bash
   npm run dev
   ```

## Automated Testing

The easiest way to test is using the provided test client script:

```bash
# Set your EVM private key (test wallet only!)
export PRIVATE_KEY=0x...

# Or set your base58 Solana private key (test wallet only!)
export SOLANA_PRIVATE_KEY=...

# Run the test client
npm run test:client
```

The test client will:

1. ✅ Request `/premium` without payment (receives 402)
2. ✅ Create and sign a payment with your wallet
3. ✅ Submit the payment and receive premium content
4. ✅ Extract the JWT cookie from the response
5. ✅ Test cookie authentication (no payment needed)

Set `SERVER_URL` to test a non-local deployment. Set `TARGET_PATH` to test a different protected route—for example, `TARGET_PATH=/__x402/protected` uses the built-in test endpoint, which works without configuring an origin. If using Solana, `SOLANA_RPC_URL` can override the public devnet RPC.

### Example Output

```text
🧪 Testing x402 v2 Payment Flow

Server: http://localhost:8787

📝 Step 1: Requesting /premium without payment...
✅ Received 402 Payment Required
{
  x402Version: 2,
  accepts: [
    { scheme: 'exact', network: 'eip155:84532', amount: '10000', ... },
    { scheme: 'exact', network: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1', amount: '10000', ... }
  ],
  ...
}

💰 Step 2: Configuring payment signer(s)...
   EVM wallet: 0x1234...5678

📤 Step 3: Sending paid request...
   Selected: exact on eip155:84532
   Settled on eip155:84532: 0x...

🍪 Step 4: Extracting authentication cookie...
✅ Payment successful! Premium content received:
   Cookie received: Yes

🍪 Step 5: Testing cookie authentication...
   Cookie: auth_token=...
   Waiting 2 seconds...
✅ Cookie authentication successful!
   No payment required!

🎉 All tests passed!

Summary:
  ✅ 402 Payment Required response
  ✅ Payment creation and signing
  ✅ Payment verification and content access
  ✅ JWT cookie issuance
  ✅ Cookie-based authentication (no repeat payment)

✨ The x402 payment flow is working correctly!
```

## Manual Testing with curl

### 1. Test the health endpoint

```bash
curl http://localhost:8787/__x402/health
# Should return: {"status":"ok","proxy":"x402-proxy","message":"This endpoint is always public",...}
```

### 2. Request protected endpoint without payment

```bash
curl -i http://localhost:8787/__x402/protected
```

You should receive:

- Status: `402 Payment Required`
- `PAYMENT-REQUIRED`: Base64-encoded x402 v2 requirements with one `accepts` entry for every configured network
- Body: An empty JSON object for API clients

Decode the header:

```bash
curl -sD /tmp/x402-headers http://localhost:8787/__x402/protected >/tmp/x402-body
grep -i '^payment-required:' /tmp/x402-headers \
  | cut -d' ' -f2- \
  | tr -d '\r' \
  | base64 --decode
```

A browser request (`Accept: text/html` with a Mozilla user agent) receives static fallback HTML explaining that `@x402/paywall` is not installed. This template intentionally does not include an interactive paywall.

### 3. Create and submit a payment

This requires using the x402 v2 SDK or a compatible wallet to:

- Parse the payment requirements
- Create a signed payment payload
- Encode it as base64

See `test-client.ts` for a complete example using `@x402/fetch`. Submit the encoded payload with the `PAYMENT-SIGNATURE` header:

```bash
curl -v http://localhost:8787/premium \
  -H "PAYMENT-SIGNATURE: <base64-encoded-payment>"
```

### 4. Test cookie authentication

After a successful payment, extract the `auth_token` cookie from the `Set-Cookie` header, then:

```bash
curl http://localhost:8787/premium \
  -H "Cookie: auth_token=<your-jwt-token>"
```

You should receive the authenticated response without being asked for payment!

## Troubleshooting

### Route configuration error

- Use CAIP-2 identifiers (e.g. `eip155:84532`, `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`)
- Set `PAY_TO` for every `eip155:*` network
- Set `PAY_TO_SOLANA` for every `solana:*` network
- Confirm the selected facilitator supports every configured network

### "Invalid payment" error

- Check that your wallet has enough testnet USDC
- Verify the signer is funded on the selected network
- Ensure the payment amount and recipient match the requirement
- For Solana, ensure the facilitator supplied `extra.feePayer` and the recipient already has a token account for the payment asset

### "Payment expired" error

- Payments have a time window (`validBefore`/`validAfter`)
- Create a fresh payment and submit immediately

### No cookie received

- Check the response headers for `Set-Cookie`
- Verify the payment was successful (status 200)
- Verify `JWT_SECRET` is set in `.dev.vars`

### Cookie doesn't work

- Ensure you're including the full cookie value
- Check that the cookie hasn't expired (1 hour)
- Verify the `JWT_SECRET` is set in `.dev.vars` and has not changed

## Environment Variables

The test client uses these environment variables:

- `PRIVATE_KEY` - (Optional) Your EVM test wallet private key (`0x...`)
- `SOLANA_PRIVATE_KEY` - (Optional) Your base58 Solana test wallet private key
- `SOLANA_RPC_URL` - (Optional) Solana RPC URL (default: `https://api.devnet.solana.com`)
- `SERVER_URL` - (Optional) Server URL (default: `http://localhost:8787`)
- `TARGET_PATH` - (Optional) Protected route to exercise (default: `/premium`)

At least one private key is required.

## Security Notes

⚠️ **NEVER use a private key from a wallet with real funds for testing!**

- Create a new test wallet specifically for Base Sepolia and/or Solana devnet
- Only fund it with testnet tokens (no real value)
- The `.dev.vars` file is gitignored - don't commit secrets!
