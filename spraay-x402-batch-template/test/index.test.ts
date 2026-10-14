import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodeFunctionData, zeroAddress } from "viem";
import app from "../src";
import type { Env } from "../src/env";
import { SPRAY_ABI } from "../src/spraay";

const SPRAAY = "0x1646452F98E36A3c9Cfc3eDD8868221E207B5eEC";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const ALICE = "0x1111111111111111111111111111111111111111";
const BOB = "0x2222222222222222222222222222222222222222";

function createEnv(overrides: Partial<Env> = {}): Env {
	return {
		PAY_TO: "0x000000000000000000000000000000000000dEaD",
		NETWORK: "base-sepolia",
		FACILITATOR_URL: "https://x402.org/facilitator",
		BATCH_PRICE: "$0.01",
		SPRAAY_CONTRACT: SPRAAY,
		BASE_RPC_URL: "https://mainnet.base.org",
		JWT_SECRET: "test-secret",
		...overrides,
	} as unknown as Env;
}

function post(path: string, body: unknown, env = createEnv()) {
	return app.fetch(
		new Request(`https://example.com${path}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}),
		env
	);
}

describe("public endpoints", () => {
	it("GET /health returns ok", async () => {
		const response = await app.fetch(
			new Request("https://example.com/health"),
			createEnv()
		);
		assert.equal(response.status, 200);
		const json = (await response.json()) as Record<string, unknown>;
		assert.equal(json.status, "ok");
		assert.equal(json.version, "1.0.0");
	});

	it("GET /info returns the Spraay contract on Base", async () => {
		const response = await app.fetch(
			new Request("https://example.com/info"),
			createEnv()
		);
		const json = (await response.json()) as Record<string, unknown>;
		assert.equal(json.spraayContract, SPRAAY);
		assert.equal(json.chainId, 8453);
		assert.equal(json.feeBps, 30);
		assert.equal(json.MAX_RECIPIENTS, 200);
		assert.equal(json.basescanUrl, `https://basescan.org/address/${SPRAAY}`);
	});
});

describe("POST /batch/estimate", () => {
	it("computes totals and the 30 bps fee", async () => {
		const response = await post("/batch/estimate", {
			token: USDC,
			recipients: [ALICE, BOB],
			amounts: ["1000000", "3000000"],
		});
		assert.equal(response.status, 200);
		assert.deepEqual(await response.json(), {
			totalAmount: "4000000",
			feeAmount: "12000",
			totalWithFee: "4012000",
			recipientCount: 2,
			token: USDC,
			spraayContract: SPRAAY,
		});
	});

	it("rejects mismatched recipients and amounts", async () => {
		const response = await post("/batch/estimate", {
			token: "ETH",
			recipients: [ALICE, BOB],
			amounts: ["1"],
		});
		assert.equal(response.status, 400);
	});

	it("rejects more than 200 recipients", async () => {
		const recipients = Array.from(
			{ length: 201 },
			(_, i) => `0x${(i + 1).toString(16).padStart(40, "0")}`
		);
		const response = await post("/batch/estimate", {
			token: "ETH",
			recipients,
			amounts: recipients.map(() => "1"),
		});
		assert.equal(response.status, 400);
	});

	it("rejects invalid addresses", async () => {
		const response = await post("/batch/estimate", {
			token: "ETH",
			recipients: [ALICE, "0xnot-an-address"],
			amounts: ["1", "1"],
		});
		assert.equal(response.status, 400);
	});

	it("rejects non-integer amounts", async () => {
		const response = await post("/batch/estimate", {
			token: "ETH",
			recipients: [ALICE],
			amounts: ["1.5"],
		});
		assert.equal(response.status, 400);
	});
});

describe("x402-gated endpoints", () => {
	it("POST /batch/execute requires payment", async () => {
		const response = await post("/batch/execute", {
			token: "ETH",
			recipients: [ALICE],
			amounts: ["1000"],
		});
		assert.equal(response.status, 402);
	});

	it("POST /batch/equal requires payment", async () => {
		const response = await post("/batch/equal", {
			token: "ETH",
			recipients: [ALICE, BOB],
			amountPerRecipient: "1000",
		});
		assert.equal(response.status, 402);
	});

	it("validates the body before asking for payment", async () => {
		const response = await post("/batch/execute", {
			token: "ETH",
			recipients: [ALICE],
			amounts: ["1", "2"],
		});
		assert.equal(response.status, 400);
	});

	it("reports a missing JWT_SECRET instead of failing silently", async () => {
		const response = await post(
			"/batch/execute",
			{ token: "ETH", recipients: [ALICE], amounts: ["1"] },
			createEnv({ JWT_SECRET: "" })
		);
		assert.equal(response.status, 500);
	});
});

describe("unsigned transactions (paid via session cookie)", async () => {
	const { generateJWT } = await import("../src/jwt");
	const token = await generateJWT("test-secret", 60);

	function paidPost(path: string, body: unknown) {
		return app.fetch(
			new Request(`https://example.com${path}`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Cookie: `auth_token=${token}`,
				},
				body: JSON.stringify(body),
			}),
			createEnv()
		);
	}

	it("encodes sprayETH with msg.value = totalWithFee", async () => {
		const response = await paidPost("/batch/execute", {
			token: "ETH",
			recipients: [ALICE, BOB],
			amounts: ["1000000", "1000000"],
		});
		assert.equal(response.status, 200);
		const { transaction } = (await response.json()) as {
			transaction: {
				to: string;
				data: `0x${string}`;
				value: string;
				chainId: number;
			};
		};
		assert.equal(transaction.to, SPRAAY);
		assert.equal(transaction.chainId, 8453);
		assert.equal(transaction.value, "2006000");
		const decoded = decodeFunctionData({
			abi: SPRAY_ABI,
			data: transaction.data,
		});
		assert.equal(decoded.functionName, "sprayETH");
	});

	it("encodes sprayToken with value 0 and an approval hint", async () => {
		const response = await paidPost("/batch/execute", {
			token: USDC,
			recipients: [ALICE],
			amounts: ["1000000"],
		});
		const json = (await response.json()) as {
			transaction: { data: `0x${string}`; value: string };
			approvalRequired: { spender: string; amount: string };
		};
		assert.equal(json.transaction.value, "0");
		assert.deepEqual(json.approvalRequired, {
			token: USDC,
			spender: SPRAAY,
			amount: "1003000",
		});
		const decoded = decodeFunctionData({
			abi: SPRAY_ABI,
			data: json.transaction.data,
		});
		assert.equal(decoded.functionName, "sprayToken");
	});

	it("encodes sprayEqual with address(0) for ETH", async () => {
		const response = await paidPost("/batch/equal", {
			token: "ETH",
			recipients: [ALICE, BOB],
			amountPerRecipient: "500",
		});
		const { transaction } = (await response.json()) as {
			transaction: { data: `0x${string}`; value: string };
		};
		const decoded = decodeFunctionData({
			abi: SPRAY_ABI,
			data: transaction.data,
		});
		assert.equal(decoded.functionName, "sprayEqual");
		assert.equal(decoded.args[0], zeroAddress);
		assert.equal(decoded.args[2], 500n);
		assert.equal(transaction.value, "1003");
	});
});
