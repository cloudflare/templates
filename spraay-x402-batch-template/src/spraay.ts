/**
 * Spraay batch payment helpers
 *
 * Everything in this file is pure: input validation, fee math and ABI
 * encoding. Nothing here signs or broadcasts transactions. The Worker returns
 * unsigned transactions and the caller signs and broadcasts them with their
 * own wallet.
 */

import { encodeFunctionData, isAddress, zeroAddress, type Hex } from "viem";

/** Spraay batch payment contract on Base mainnet */
export const SPRAAY_CONTRACT = "0x1646452F98E36A3c9Cfc3eDD8868221E207B5eEC";

/** Base mainnet chain ID - the chain the Spraay contract is deployed on */
export const BASE_CHAIN_ID = 8453;

/** Spraay protocol fee in basis points (0.3%) */
export const FEE_BPS = 30n;

/** Maximum number of recipients per Spraay transaction */
export const MAX_RECIPIENTS = 200;

const MAX_UINT256 = 2n ** 256n - 1n;

/** Spraay contract ABI (only the functions this Worker encodes) */
export const SPRAY_ABI = [
	{
		name: "sprayETH",
		type: "function",
		stateMutability: "payable",
		inputs: [
			{
				name: "recipients",
				type: "tuple[]",
				components: [
					{ name: "addr", type: "address" },
					{ name: "amount", type: "uint256" },
				],
			},
		],
		outputs: [],
	},
	{
		name: "sprayToken",
		type: "function",
		stateMutability: "nonpayable",
		inputs: [
			{ name: "token", type: "address" },
			{
				name: "recipients",
				type: "tuple[]",
				components: [
					{ name: "addr", type: "address" },
					{ name: "amount", type: "uint256" },
				],
			},
		],
		outputs: [],
	},
	{
		name: "sprayEqual",
		type: "function",
		stateMutability: "payable",
		inputs: [
			{ name: "token", type: "address" },
			{ name: "recipients", type: "address[]" },
			{ name: "amountPerRecipient", type: "uint256" },
		],
		outputs: [],
	},
] as const;

/** Request body for /batch/estimate and /batch/execute */
export interface BatchRequest {
	/** ERC-20 token address, or "ETH" for native ETH */
	token: string;
	/** Recipient addresses */
	recipients: string[];
	/** Raw base-unit amounts (e.g. "1000000" = 1 USDC), one per recipient */
	amounts: string[];
	/** Optional sender address, used for RPC gas estimation */
	from?: string;
}

/** Request body for /batch/equal */
export interface EqualBatchRequest {
	/** ERC-20 token address, or "ETH" for native ETH */
	token: string;
	/** Recipient addresses */
	recipients: string[];
	/** Raw base-unit amount every recipient receives */
	amountPerRecipient: string;
	/** Optional sender address, used for RPC gas estimation */
	from?: string;
}

/** Validated batch, normalized to bigint amounts */
export interface ParsedBatch {
	isNative: boolean;
	token: "ETH" | Hex;
	recipients: Hex[];
	amounts: bigint[];
	from?: Hex;
}

export type ParseResult<T> =
	| { ok: true; value: T }
	| { ok: false; error: string };

export interface FeeEstimate {
	totalAmount: bigint;
	feeAmount: bigint;
	totalWithFee: bigint;
}

/** Unsigned transaction returned to the caller to sign and broadcast */
export interface UnsignedTransaction {
	to: string;
	data: Hex;
	value: string;
	chainId: number;
	gasLimit: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parse a raw base-unit amount: a positive integer string that fits uint256 */
function parseAmount(value: unknown): bigint | null {
	if (typeof value !== "string" || !/^[0-9]+$/.test(value)) {
		return null;
	}
	const amount = BigInt(value);
	return amount > 0n && amount <= MAX_UINT256 ? amount : null;
}

function parseToken(value: unknown): ParseResult<"ETH" | Hex> {
	if (value === "ETH") {
		return { ok: true, value: "ETH" };
	}
	if (typeof value !== "string" || !isAddress(value, { strict: false })) {
		return {
			ok: false,
			error: '"token" must be an ERC-20 contract address or "ETH"',
		};
	}
	if (value.toLowerCase() === zeroAddress) {
		return {
			ok: false,
			error: '"token" must not be the zero address; use "ETH" for native ETH',
		};
	}
	return { ok: true, value: value as Hex };
}

function parseRecipients(value: unknown): ParseResult<Hex[]> {
	if (!Array.isArray(value) || value.length === 0) {
		return { ok: false, error: '"recipients" must be a non-empty array' };
	}
	if (value.length > MAX_RECIPIENTS) {
		return {
			ok: false,
			error: `Too many recipients: ${value.length} (max ${MAX_RECIPIENTS})`,
		};
	}
	for (const [i, recipient] of value.entries()) {
		if (
			typeof recipient !== "string" ||
			!isAddress(recipient, { strict: false }) ||
			recipient.toLowerCase() === zeroAddress
		) {
			return {
				ok: false,
				error: `Invalid recipient address at index ${i}`,
			};
		}
	}
	return { ok: true, value: value as Hex[] };
}

function parseFrom(value: unknown): ParseResult<Hex | undefined> {
	if (value === undefined) {
		return { ok: true, value: undefined };
	}
	if (typeof value !== "string" || !isAddress(value, { strict: false })) {
		return { ok: false, error: '"from" must be a valid address' };
	}
	return { ok: true, value: value as Hex };
}

/** Validate a /batch/estimate or /batch/execute request body */
export function parseBatchRequest(body: unknown): ParseResult<ParsedBatch> {
	if (!isObject(body)) {
		return { ok: false, error: "Request body must be a JSON object" };
	}

	const token = parseToken(body.token);
	if (!token.ok) {
		return token;
	}
	const recipients = parseRecipients(body.recipients);
	if (!recipients.ok) {
		return recipients;
	}
	if (
		!Array.isArray(body.amounts) ||
		body.amounts.length !== recipients.value.length
	) {
		return {
			ok: false,
			error: '"recipients" and "amounts" must have the same length',
		};
	}

	const amounts: bigint[] = [];
	for (const [i, raw] of body.amounts.entries()) {
		const amount = parseAmount(raw);
		if (amount === null) {
			return {
				ok: false,
				error: `Invalid amount at index ${i}: must be a positive integer string in base units`,
			};
		}
		amounts.push(amount);
	}

	const from = parseFrom(body.from);
	if (!from.ok) {
		return from;
	}

	return {
		ok: true,
		value: {
			isNative: token.value === "ETH",
			token: token.value,
			recipients: recipients.value,
			amounts,
			from: from.value,
		},
	};
}

/**
 * Validate a /batch/equal request body. The result is expanded into a
 * ParsedBatch (one amount per recipient) so fee math is shared.
 */
export function parseEqualBatchRequest(
	body: unknown
): ParseResult<ParsedBatch> {
	if (!isObject(body)) {
		return { ok: false, error: "Request body must be a JSON object" };
	}

	const token = parseToken(body.token);
	if (!token.ok) {
		return token;
	}
	const recipients = parseRecipients(body.recipients);
	if (!recipients.ok) {
		return recipients;
	}
	const amountPerRecipient = parseAmount(body.amountPerRecipient);
	if (amountPerRecipient === null) {
		return {
			ok: false,
			error:
				'"amountPerRecipient" must be a positive integer string in base units',
		};
	}
	const from = parseFrom(body.from);
	if (!from.ok) {
		return from;
	}

	return {
		ok: true,
		value: {
			isNative: token.value === "ETH",
			token: token.value,
			recipients: recipients.value,
			amounts: recipients.value.map(() => amountPerRecipient),
			from: from.value,
		},
	};
}

/** Compute the batch total and the Spraay fee (totalAmount * 30 / 10000) */
export function estimateFees(amounts: bigint[]): FeeEstimate {
	const totalAmount = amounts.reduce((sum, amount) => sum + amount, 0n);
	const feeAmount = (totalAmount * FEE_BPS) / 10_000n;
	return { totalAmount, feeAmount, totalWithFee: totalAmount + feeAmount };
}

/**
 * Rough gas limit used when no RPC estimate is available. Per-recipient cost
 * is higher for ERC-20 transfers (token balance storage writes) than for ETH.
 */
export function heuristicGasLimit(batch: ParsedBatch): bigint {
	const perRecipient = batch.isNative ? 35_000n : 55_000n;
	return 60_000n + perRecipient * BigInt(batch.recipients.length);
}

/**
 * Encode calldata for sprayETH (native) or sprayToken (ERC-20).
 * For ETH the caller sends totalWithFee as msg.value.
 */
export function encodeBatchCall(batch: ParsedBatch): {
	data: Hex;
	value: bigint;
} {
	const recipients = batch.recipients.map((addr, i) => ({
		addr,
		amount: batch.amounts[i],
	}));

	if (batch.isNative) {
		return {
			data: encodeFunctionData({
				abi: SPRAY_ABI,
				functionName: "sprayETH",
				args: [recipients],
			}),
			value: estimateFees(batch.amounts).totalWithFee,
		};
	}

	return {
		data: encodeFunctionData({
			abi: SPRAY_ABI,
			functionName: "sprayToken",
			args: [batch.token as Hex, recipients],
		}),
		value: 0n,
	};
}

/**
 * Encode calldata for sprayEqual. Native ETH is represented by address(0).
 */
export function encodeEqualCall(batch: ParsedBatch): {
	data: Hex;
	value: bigint;
} {
	const token = batch.isNative ? zeroAddress : (batch.token as Hex);
	return {
		data: encodeFunctionData({
			abi: SPRAY_ABI,
			functionName: "sprayEqual",
			args: [token, batch.recipients, batch.amounts[0]],
		}),
		value: batch.isNative ? estimateFees(batch.amounts).totalWithFee : 0n,
	};
}
