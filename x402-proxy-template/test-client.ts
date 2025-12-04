/**
 * Test client for x402 payment flow
 *
 * This script tests the complete payment and cookie flow:
 * 1. Requests the protected endpoint without payment (should get 402)
 * 2. Creates and signs a payment
 * 3. Retries the request with the payment
 * 4. Saves the cookie
 * 5. Tests access with the cookie (no payment needed)
 */

import { type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createPaymentHeader } from "x402/client";

// Configuration
const SERVER_URL = process.env.SERVER_URL || "http://localhost:8787";
const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;

if (!PRIVATE_KEY) {
	console.error("❌ Error: PRIVATE_KEY environment variable is required");
	console.log("\nUsage:");
	console.log("  PRIVATE_KEY=0x... npm run test:client");
	process.exit(1);
}

interface PaymentRequirement {
	scheme: string;
	network: string;
	maxAmountRequired: string;
	resource: string;
	description: string;
	mimeType: string;
	maxTimeoutSeconds: number;
	payTo: Address;
	asset: string;
}

interface X402Response {
	error: string;
	accepts: PaymentRequirement[];
	x402Version: number;
}

async function main() {
	console.log("🧪 Testing x402 Payment Flow\n");
	console.log(`Server: ${SERVER_URL}`);
	console.log(`Network: Base Sepolia (testnet)\n`);

	// Step 1: Request without payment (should get 402)
	console.log("📝 Step 1: Requesting /premium without payment...");
	const initialResponse = await fetch(`${SERVER_URL}/premium`);

	if (initialResponse.status !== 402) {
		console.error(`❌ Expected 402, got ${initialResponse.status}`);
		process.exit(1);
	}

	const paymentInfo: X402Response = await initialResponse.json();
	console.log("✅ Received 402 Payment Required");
	console.log(
		`   Payment needed: ${paymentInfo.accepts[0]?.maxAmountRequired}`
	);
	console.log(`   Description: ${paymentInfo.accepts[0]?.description}\n`);

	// Step 2: Set up wallet and create payment
	console.log("💰 Step 2: Creating and signing payment...");

	const account = privateKeyToAccount(PRIVATE_KEY);
	console.log(`   Wallet: ${account.address}`);

	const requirement = paymentInfo.accepts[0];
	if (!requirement) {
		console.error("❌ No payment requirements found");
		process.exit(1);
	}

	// Create payment using x402 SDK
	const paymentHeader = await createPaymentHeader(
		account,
		paymentInfo.x402Version,
		requirement as Parameters<typeof createPaymentHeader>[2]
	);

	console.log("✅ Payment signed");
	console.log(`   Amount: ${requirement.maxAmountRequired}`);
	console.log(`   Recipient: ${requirement.payTo}\n`);

	// Step 3: Retry request with payment
	console.log("📤 Step 3: Sending request with payment...");

	const paidResponse = await fetch(`${SERVER_URL}/premium`, {
		headers: {
			"X-PAYMENT": paymentHeader,
		},
	});

	if (!paidResponse.ok) {
		console.error(`❌ Payment failed with status ${paidResponse.status}`);
		const errorBody = await paidResponse.text();
		console.error(`   Error: ${errorBody}`);
		process.exit(1);
	}

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

	// Step 4: Test access with cookie (no payment needed)
	console.log("🍪 Step 4: Testing cookie authentication...");
	console.log(`   Cookie: auth_token=${authToken}`);
	console.log("   Waiting 2 seconds...");
	await new Promise((resolve) => setTimeout(resolve, 2000));

	const cookieResponse = await fetch(`${SERVER_URL}/premium`, {
		headers: {
			Cookie: `auth_token=${authToken}`,
		},
	});

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
