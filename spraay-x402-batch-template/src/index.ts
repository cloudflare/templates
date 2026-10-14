/**
 * Spraay x402 Batch Payments Worker
 *
 * Lets AI agents and apps pay multiple recipients in a single on-chain
 * transaction through Spraay's batch payment contract on Base:
 *
 * - GET  /health          public  - health check
 * - GET  /info            public  - contract details and supported operations
 * - POST /batch/estimate  public  - fee and total estimate for a batch
 * - POST /batch/execute   x402    - unsigned sprayETH / sprayToken transaction
 * - POST /batch/equal     x402    - unsigned sprayEqual transaction
 *
 * The Worker never holds keys. It returns unsigned transactions; the caller
 * signs and broadcasts them with their own wallet.
 */

import { Hono, type Context } from "hono";
import { numberToHex, type Hex } from "viem";
import type { AppContext, Env } from "./env";
import { requireBatchPayment } from "./payment";
import {
	BASE_CHAIN_ID,
	FEE_BPS,
	MAX_RECIPIENTS,
	SPRAAY_CONTRACT,
	encodeBatchCall,
	encodeEqualCall,
	estimateFees,
	heuristicGasLimit,
	parseBatchRequest,
	parseEqualBatchRequest,
	type ParsedBatch,
	type UnsignedTransaction,
} from "./spraay";

const VERSION = "1.0.0";

const app = new Hono<AppContext>();

function spraayContract(env: Env): string {
	return env.SPRAAY_CONTRACT || SPRAAY_CONTRACT;
}

/** Read the JSON body (Hono caches it), returning undefined on bad JSON */
async function readJson(c: Context<AppContext>): Promise<unknown> {
	try {
		return await c.req.json();
	} catch {
		return undefined;
	}
}

/**
 * Estimate gas with eth_estimateGas when the caller tells us who will send
 * the transaction. The estimate only succeeds if that address already holds
 * the funds (and, for ERC-20, has approved the Spraay contract), so fall back
 * to a heuristic on any failure.
 */
async function estimateGasLimit(
	env: Env,
	batch: ParsedBatch,
	tx: { to: string; data: Hex; value: bigint }
): Promise<{ gasLimit: bigint; source: "rpc" | "heuristic" }> {
	if (batch.from && env.BASE_RPC_URL) {
		try {
			const response = await fetch(env.BASE_RPC_URL, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "eth_estimateGas",
					params: [
						{
							from: batch.from,
							to: tx.to,
							data: tx.data,
							value: numberToHex(tx.value),
						},
					],
				}),
			});
			const json = (await response.json()) as { result?: string };
			if (json.result) {
				// Add a 20% buffer on top of the node's estimate
				return {
					gasLimit: (BigInt(json.result) * 120n) / 100n,
					source: "rpc",
				};
			}
		} catch (error) {
			console.warn("eth_estimateGas failed, using heuristic", error);
		}
	}
	return { gasLimit: heuristicGasLimit(batch), source: "heuristic" };
}

/** Build the JSON response for a paid /batch/* route */
async function buildTransactionResponse(
	env: Env,
	batch: ParsedBatch,
	call: { data: Hex; value: bigint }
) {
	const to = spraayContract(env);
	const fees = estimateFees(batch.amounts);
	const gas = await estimateGasLimit(env, batch, { to, ...call });

	const transaction: UnsignedTransaction = {
		to,
		data: call.data,
		value: call.value.toString(),
		chainId: BASE_CHAIN_ID,
		gasLimit: gas.gasLimit.toString(),
	};

	return {
		transaction,
		gasEstimateSource: gas.source,
		estimate: {
			totalAmount: fees.totalAmount.toString(),
			feeAmount: fees.feeAmount.toString(),
			totalWithFee: fees.totalWithFee.toString(),
			recipientCount: batch.recipients.length,
			token: batch.token,
		},
		// ERC-20 batches pull tokens from the sender, so the sender must first
		// approve the Spraay contract for at least totalWithFee.
		approvalRequired: batch.isNative
			? null
			: {
					token: batch.token,
					spender: to,
					amount: fees.totalWithFee.toString(),
				},
	};
}

/**
 * Health check - always public
 */
app.get("/health", (c) => {
	return c.json({ status: "ok", version: VERSION, timestamp: Date.now() });
});

/**
 * Contract details and supported operations - always public.
 * Also reports configuration problems so they are visible after deploy.
 */
app.get("/info", (c) => {
	const contract = spraayContract(c.env);
	const warnings: string[] = [];
	if (!c.env.JWT_SECRET) {
		warnings.push(
			"JWT_SECRET is not set - paid endpoints will return 500. See README."
		);
	}
	if (/^0x0{40}$/i.test(c.env.PAY_TO)) {
		warnings.push(
			"PAY_TO is the zero address - set your own wallet in wrangler.jsonc."
		);
	}

	return c.json({
		spraayContract: contract,
		chain: "base",
		chainId: BASE_CHAIN_ID,
		basescanUrl: `https://basescan.org/address/${contract}`,
		feeBps: Number(FEE_BPS),
		MAX_RECIPIENTS,
		supportedFunctions: [
			"sprayETH((address addr, uint256 amount)[] recipients)",
			"sprayToken(address token, (address addr, uint256 amount)[] recipients)",
			"sprayEqual(address token, address[] recipients, uint256 amountPerRecipient)",
		],
		x402: {
			network: c.env.NETWORK,
			price: c.env.BATCH_PRICE,
			paidRoutes: ["/batch/execute", "/batch/equal"],
		},
		warnings,
	});
});

/**
 * Fee and total estimate - free, no payment required
 */
app.post("/batch/estimate", async (c) => {
	const parsed = parseBatchRequest(await readJson(c));
	if (!parsed.ok) {
		return c.json({ error: parsed.error }, 400);
	}

	const batch = parsed.value;
	const fees = estimateFees(batch.amounts);
	return c.json({
		totalAmount: fees.totalAmount.toString(),
		feeAmount: fees.feeAmount.toString(),
		totalWithFee: fees.totalWithFee.toString(),
		recipientCount: batch.recipients.length,
		token: batch.token,
		spraayContract: spraayContract(c.env),
	});
});

/**
 * Build an unsigned sprayETH / sprayToken transaction - x402 gated.
 *
 * The request body is validated before the payment gate so callers are never
 * charged for a request that would be rejected anyway.
 */
app.post(
	"/batch/execute",
	async (c, next) => {
		const parsed = parseBatchRequest(await readJson(c));
		if (!parsed.ok) {
			return c.json({ error: parsed.error }, 400);
		}
		await next();
	},
	requireBatchPayment("Build an unsigned Spraay batch payment transaction"),
	async (c) => {
		const parsed = parseBatchRequest(await readJson(c));
		if (!parsed.ok) {
			return c.json({ error: parsed.error }, 400);
		}
		const batch = parsed.value;
		return c.json(
			await buildTransactionResponse(c.env, batch, encodeBatchCall(batch))
		);
	}
);

/**
 * Build an unsigned sprayEqual transaction - x402 gated.
 */
app.post(
	"/batch/equal",
	async (c, next) => {
		const parsed = parseEqualBatchRequest(await readJson(c));
		if (!parsed.ok) {
			return c.json({ error: parsed.error }, 400);
		}
		await next();
	},
	requireBatchPayment(
		"Build an unsigned Spraay equal-distribution transaction"
	),
	async (c) => {
		const parsed = parseEqualBatchRequest(await readJson(c));
		if (!parsed.ok) {
			return c.json({ error: parsed.error }, 400);
		}
		const batch = parsed.value;
		return c.json(
			await buildTransactionResponse(c.env, batch, encodeEqualCall(batch))
		);
	}
);

export default app;
