/**
 * Test client for x402 v2 payment flow
 *
 * This script tests the complete payment and cookie flow:
 * 1. Requests the protected endpoint without payment (should get 402)
 * 2. Creates and signs a payment
 * 3. Retries the request with the payment
 * 4. Saves the cookie
 * 5. Tests access with the cookie (no payment needed)
 */

import { base58 } from "@scure/base";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import {
	type PaymentRequired,
	type PaymentRequirements,
	wrapFetchWithPayment,
	x402Client,
} from "@x402/fetch";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

// Configuration
const SERVER_URL = process.env.SERVER_URL || "http://localhost:8787";
const TARGET_PATH = process.env.TARGET_PATH || "/premium";
const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}` | undefined;
const SOLANA_PRIVATE_KEY = process.env.SOLANA_PRIVATE_KEY;
const SOLANA_RPC_URL =
	process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

if (!PRIVATE_KEY && !SOLANA_PRIVATE_KEY) {
	console.error(
		"❌ Error: set PRIVATE_KEY, SOLANA_PRIVATE_KEY, or both before running the client"
	);
	console.log("\nUsage:");
	console.log("  PRIVATE_KEY=0x... npm run test:client");
	console.log("  SOLANA_PRIVATE_KEY=<base58-key> npm run test:client");
	process.exit(1);
}

function decodePaymentRequired(response: Response): PaymentRequired {
	const encoded = response.headers.get("payment-required");
	if (!encoded) {
		throw new Error("402 response did not include PAYMENT-REQUIRED");
	}
	return JSON.parse(
		Buffer.from(encoded, "base64").toString("utf8")
	) as PaymentRequired;
}

async function main() {
	console.log("🧪 Testing x402 v2 Payment Flow\n");
	console.log(`Server: ${SERVER_URL}\n`);

	// Step 1: Request without payment (should get 402)
	console.log(`📝 Step 1: Requesting ${TARGET_PATH} without payment...`);
	const initialResponse = await fetch(`${SERVER_URL}${TARGET_PATH}`);
	if (initialResponse.status !== 402) {
		console.error(`❌ Expected 402, got ${initialResponse.status}`);
		process.exit(1);
	}

	// Decode the v2 response header.
	const paymentRequired = decodePaymentRequired(initialResponse);
	console.log("✅ Received 402 Payment Required");
	console.dir(paymentRequired, { depth: null });

	// Step 2: Set up wallet and create payment
	console.log("\n💰 Step 2: Configuring payment signer(s)...");
	const selectRequirements = (
		_x402Version: number,
		options: PaymentRequirements[]
	): PaymentRequirements => {
		const selected = options[0];
		console.log(`   Selected: ${selected.scheme} on ${selected.network}`);
		return selected;
	};
	const client = new x402Client(selectRequirements);

	if (PRIVATE_KEY) {
		const account = privateKeyToAccount(PRIVATE_KEY);
		client.register("eip155:*", new ExactEvmScheme(account));
		console.log(`   EVM wallet: ${account.address}`);
	}
	if (SOLANA_PRIVATE_KEY) {
		const signer = await createKeyPairSignerFromBytes(
			base58.decode(SOLANA_PRIVATE_KEY)
		);
		client.register(
			"solana:*",
			new ExactSvmScheme(signer, { rpcUrl: SOLANA_RPC_URL })
		);
		console.log(`   Solana wallet: ${signer.address}`);
		console.log(`   Solana RPC: ${SOLANA_RPC_URL}`);
	}

	// Step 3: Retry request with payment
	// The wrapper repeats the request, selects a compatible requirement,
	// signs PAYMENT-SIGNATURE, and performs the paid retry.
	console.log("\n📤 Step 3: Sending paid request...");
	const fetchWithPayment = wrapFetchWithPayment(fetch, client);
	const paidResponse = await fetchWithPayment(`${SERVER_URL}${TARGET_PATH}`);
	const paidBody = await paidResponse.text();
	if (!paidResponse.ok) {
		console.error(`❌ Payment failed with status ${paidResponse.status}`);
		let reason = paidBody;
		try {
			reason =
				`${decodePaymentRequired(paidResponse).error} ${paidBody}`.trim();
		} catch {
			// No PAYMENT-REQUIRED header on the failure; fall back to the body.
		}
		console.error(`   Error: ${reason}`);
		process.exit(1);
	}

	const settlementHeader = paidResponse.headers.get("payment-response");
	if (settlementHeader) {
		const settlement = JSON.parse(
			Buffer.from(settlementHeader, "base64").toString("utf8")
		);
		console.log(
			`   Settled on ${settlement.network}: ${settlement.transaction}`
		);
	}

	// Step 4: Save the JWT cookie returned after successful settlement.
	console.log("\n🍪 Step 4: Extracting authentication cookie...");
	// Extract cookie from response
	const setCookieHeader = paidResponse.headers.get("set-cookie");
	let authToken = "";
	if (setCookieHeader) {
		const match = setCookieHeader.match(/auth_token=([^;]+)/);
		if (match) {
			authToken = match[1];
		}
	}

	console.log("✅ Payment successful! Premium content received:");
	console.log(`   Cookie received: ${authToken ? "Yes" : "No"}\n`);
	if (!authToken) {
		console.warn("⚠️  Warning: No auth cookie received");
		console.log("   Skipping cookie authentication test\n");
		return;
	}

	// Step 5: Test access with cookie (no payment needed)
	console.log("🍪 Step 5: Testing cookie authentication...");
	console.log(`   Cookie: auth_token=${authToken}`);
	console.log("   Waiting 2 seconds...");
	await new Promise((resolve) => setTimeout(resolve, 2000));

	const cookieResponse = await fetch(`${SERVER_URL}${TARGET_PATH}`, {
		headers: { Cookie: `auth_token=${authToken}` },
	});
	await cookieResponse.text();
	if (!cookieResponse.ok) {
		console.error(`❌ Cookie auth failed with status ${cookieResponse.status}`);
		process.exit(1);
	}

	console.log("✅ Cookie authentication successful!");
	console.log(`   No payment required!\n`);

	// Success summary
	console.log("🎉 All tests passed!\n");
	console.log("Summary:");
	console.log("  ✅ 402 Payment Required response");
	console.log("  ✅ Payment creation and signing");
	console.log("  ✅ Payment verification and content access");
	console.log("  ✅ JWT cookie issuance");
	console.log("  ✅ Cookie-based authentication (no repeat payment)");
	console.log("\n✨ The x402 payment flow is working correctly!");
}

// Run the test
main().catch((error) => {
	console.error("\n❌ Test failed:");
	console.error(error);
	process.exit(1);
});
