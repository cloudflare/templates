import { describe, expect, it, vi } from "vitest";
import { checkPrompt } from "../src/voice/checkPrompt";
import {
	BLOCKED_OUTPUT_FALLBACK,
	guardVoiceOutput,
} from "../src/voice/outputGuardrail";

type GuardrailAI = Parameters<typeof checkPrompt>[0];

function aiResponse(body: string, status = 200): GuardrailAI {
	return {
		run: vi.fn(async () => new Response(body, { status })),
	};
}

describe("input guardrail", () => {
	it("accepts a raw safe verdict", async () => {
		await expect(checkPrompt(aiResponse("safe"), "hello")).resolves.toEqual({
			safe: true,
		});
	});

	it("maps unsafe categories to a stable user-safe result", async () => {
		await expect(
			checkPrompt(aiResponse("unsafe\nS1,S10"), "blocked"),
		).resolves.toEqual({
			safe: false,
			message: "Blocked for: violent crimes, hate speech.",
			categories: ["S1", "S10"],
		});
	});

	it("accepts the declared structured response shape", async () => {
		await expect(
			checkPrompt(
				aiResponse(
					JSON.stringify({
						response: { safe: false, categories: ["S7"] },
					}),
				),
				"blocked",
			),
		).resolves.toMatchObject({ safe: false, categories: ["S7"] });
	});

	it("fails closed on malformed or failed responses", async () => {
		await expect(
			checkPrompt(aiResponse('{"unexpected":true}'), "hello"),
		).rejects.toThrow("Invalid response");
		await expect(
			checkPrompt(aiResponse("error", 503), "hello"),
		).rejects.toThrow("HTTP 503");
	});

	it("propagates caller cancellation", async () => {
		const controller = new AbortController();
		controller.abort();
		await expect(
			checkPrompt(aiResponse("safe"), "hello", controller.signal),
		).rejects.toMatchObject({ name: "AbortError" });
	});
});

describe("output guardrail", () => {
	it("passes approved text through unchanged", async () => {
		const state = { blocked: false, fallbackUsed: false };
		const result = await guardVoiceOutput(
			"approved",
			state,
			new AbortController().signal,
			async () => ({ safe: true }),
		);
		expect(result).toEqual({ outcome: "allowed", text: "approved" });
	});

	it("emits one trusted fallback and suppresses later sentences", async () => {
		const state = { blocked: false, fallbackUsed: false };
		const signal = new AbortController().signal;
		const check = async () =>
			({
				safe: false,
				message: "Blocked.",
				categories: ["S1"],
			}) as const;

		const first = await guardVoiceOutput("first", state, signal, check);
		const second = await guardVoiceOutput("second", state, signal, check);

		expect(first).toMatchObject({
			outcome: "blocked",
			text: BLOCKED_OUTPUT_FALLBACK,
			notify: true,
		});
		expect(second).toMatchObject({
			outcome: "blocked",
			text: null,
			notify: false,
		});
	});

	it("fails closed when the output check errors", async () => {
		const result = await guardVoiceOutput(
			"unchecked",
			{ blocked: false, fallbackUsed: false },
			new AbortController().signal,
			async () => {
				throw new Error("guardrail unavailable");
			},
		);
		expect(result).toMatchObject({
			outcome: "error",
			text: BLOCKED_OUTPUT_FALLBACK,
		});
	});
});
