import { z } from "zod";

const MODEL = "@cf/meta/llama-guard-3-8b" as const;
const TIMEOUT_MS = 10_000;

const SAFETY_CATEGORIES = {
	S1: "Violent crimes",
	S2: "Non-violent crimes",
	S3: "Sex-related crimes",
	S4: "Child sexual exploitation",
	S5: "Defamation",
	S6: "Specialized advice",
	S7: "Privacy violations",
	S8: "Intellectual property",
	S9: "Indiscriminate weapons",
	S10: "Hate speech",
	S11: "Suicide and self-harm",
	S12: "Sexual content",
	S13: "Elections",
	S14: "Code interpreter abuse",
} as const;

type SafetyCategoryCode = keyof typeof SAFETY_CATEGORIES;

export type GuardrailResult =
	| { safe: true }
	| { safe: false; message: string; categories: SafetyCategoryCode[] };

interface GuardrailAI {
	run(
		model: typeof MODEL,
		inputs: {
			messages: { role: "user"; content: string }[];
			max_tokens: number;
			temperature: number;
		},
		options: { returnRawResponse: true; signal: AbortSignal },
	): Promise<Response>;
}

const LlamaGuardResponseSchema = z.object({
	response: z.union([
		z.string(),
		z.object({
			safe: z.boolean(),
			categories: z.array(z.string()).optional(),
		}),
	]),
});

function decodeLlamaGuardBody(body: string): unknown {
	const trimmed = body.trim();
	if (!trimmed) throw new Error("Empty response from LlamaGuard");

	try {
		const decoded: unknown = JSON.parse(trimmed);
		return typeof decoded === "string" ? { response: decoded } : decoded;
	} catch {
		return { response: trimmed };
	}
}

function blockedResult(categories: readonly string[]): GuardrailResult {
	const known = categories
		.map((code) => code.trim().toUpperCase())
		.filter((code): code is SafetyCategoryCode => code in SAFETY_CATEGORIES);
	const labels = known.map((code) => SAFETY_CATEGORIES[code]);
	return {
		safe: false,
		message:
			labels.length > 0
				? `Blocked for: ${labels.join(", ").toLowerCase()}.`
				: "Blocked by safety guardrails.",
		categories: known,
	};
}

function parseLlamaGuardOutput(text: string): GuardrailResult {
	const trimmed = text.trim();
	if (!trimmed) throw new Error("Empty response from LlamaGuard");
	if (trimmed.toLowerCase() === "safe") return { safe: true };

	const lines = trimmed.split("\n");
	if (lines[0]?.toLowerCase() !== "unsafe") {
		throw new Error("Unexpected LlamaGuard output");
	}
	return blockedResult((lines[1] ?? "").split(","));
}

export async function checkPrompt(
	ai: GuardrailAI,
	prompt: string,
	callerSignal?: AbortSignal,
): Promise<GuardrailResult> {
	callerSignal?.throwIfAborted();
	const timeoutSignal = AbortSignal.timeout(TIMEOUT_MS);
	const signal = callerSignal
		? AbortSignal.any([callerSignal, timeoutSignal])
		: timeoutSignal;

	try {
		const rawResponse = await ai.run(
			MODEL,
			{
				messages: [{ role: "user", content: prompt }],
				max_tokens: 500,
				temperature: 0,
			},
			{ returnRawResponse: true, signal },
		);
		if (!rawResponse.ok) {
			throw new Error(
				`LlamaGuard request failed with HTTP ${rawResponse.status}`,
			);
		}

		const raw = decodeLlamaGuardBody(await rawResponse.text());
		const parsed = LlamaGuardResponseSchema.safeParse(raw);
		if (!parsed.success) {
			throw new Error("Invalid response from LlamaGuard");
		}
		callerSignal?.throwIfAborted();
		const verdict = parsed.data.response;
		if (typeof verdict === "string") return parseLlamaGuardOutput(verdict);
		if (verdict.safe === true) return { safe: true };
		return blockedResult(verdict.categories ?? []);
	} catch (error) {
		callerSignal?.throwIfAborted();
		if (timeoutSignal.aborted) {
			throw new Error("LlamaGuard timeout", { cause: error });
		}
		throw error;
	}
}
