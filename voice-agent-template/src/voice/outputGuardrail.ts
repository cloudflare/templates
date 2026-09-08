import type { GuardrailResult } from "./checkPrompt";

export const BLOCKED_OUTPUT_FALLBACK =
	"I'm sorry, but I can't provide that response. Please try another question.";

export interface OutputGuardrailState {
	blocked: boolean;
	fallbackUsed: boolean;
}

export type OutputGuardrailResult =
	| { outcome: "allowed"; text: string }
	| {
			outcome: "blocked" | "error";
			text: string | null;
			notify: boolean;
			message: string;
			categories?: readonly string[];
	  }
	| { outcome: "aborted"; text: null };

function isAbortError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"name" in error &&
		error.name === "AbortError"
	);
}

function suppressWithFallback(
	state: OutputGuardrailState,
	outcome: "blocked" | "error",
	message: string,
	categories?: readonly string[],
): OutputGuardrailResult {
	state.blocked = true;
	const notify = !state.fallbackUsed;
	if (notify) state.fallbackUsed = true;
	return {
		outcome,
		text: notify ? BLOCKED_OUTPUT_FALLBACK : null,
		notify,
		message,
		...(categories ? { categories } : {}),
	};
}

export async function guardVoiceOutput(
	text: string,
	state: OutputGuardrailState,
	signal: AbortSignal,
	check: (text: string, signal: AbortSignal) => Promise<GuardrailResult>,
): Promise<OutputGuardrailResult> {
	if (signal.aborted) return { outcome: "aborted", text: null };
	if (state.blocked) {
		return {
			outcome: "blocked",
			text: null,
			notify: false,
			message: "Blocked by safety guardrails.",
		};
	}

	try {
		const result = await check(text, signal);
		if (signal.aborted) return { outcome: "aborted", text: null };
		if (result.safe) return { outcome: "allowed", text };
		return suppressWithFallback(
			state,
			"blocked",
			result.message,
			result.categories,
		);
	} catch (error) {
		if (signal.aborted || isAbortError(error)) {
			return { outcome: "aborted", text: null };
		}
		return suppressWithFallback(
			state,
			"error",
			"Safety check unavailable. Please try again.",
		);
	}
}
