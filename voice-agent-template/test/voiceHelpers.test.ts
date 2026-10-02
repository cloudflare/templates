import type { TTSProvider } from "@cloudflare/voice";
import { describe, expect, it, vi } from "vitest";
import {
	CONVERSATION_RETENTION_MS,
	claimCall,
	conversationCleanupDeadline,
	nextConversationCleanupDeadline,
	normalizeConversationCleanupScheduleTime,
	releaseCall,
} from "../src/voice/lifecycle";
import { RetryingTts } from "../src/voice/retryingTts";
import { prepareTextForSpeech } from "../src/voice/speechPreparation";

describe("voice lifecycle helpers", () => {
	it("replaces and releases only the active call owner", () => {
		expect(claimCall("old", "new")).toEqual({
			activeCallId: "new",
			replacedCallId: "old",
		});
		expect(releaseCall("new", "old")).toEqual({
			activeCallId: "new",
			released: false,
		});
		expect(releaseCall("new", "new")).toEqual({
			activeCallId: null,
			released: true,
		});
	});

	it("keeps cleanup at or before the one-hour deadline", () => {
		const timestamp = 1_000;
		expect(conversationCleanupDeadline(timestamp)).toBe(
			timestamp + CONVERSATION_RETENTION_MS,
		);
		expect(nextConversationCleanupDeadline(timestamp, 2_000)).toBe(
			timestamp + CONVERSATION_RETENTION_MS,
		);
		expect(normalizeConversationCleanupScheduleTime(12_345)).toBe(12_000);
	});
});

describe("retrying TTS", () => {
	it("retries empty audio once", async () => {
		const audio = new ArrayBuffer(4);
		const synthesize = vi
			.fn()
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce(audio);
		const provider = { synthesize } satisfies TTSProvider;
		await expect(new RetryingTts(provider).synthesize("hello")).resolves.toBe(
			audio,
		);
		expect(synthesize).toHaveBeenCalledTimes(2);
	});

	it("does not retry an abort", async () => {
		const synthesize = vi.fn(async () => {
			throw new DOMException("Aborted", "AbortError");
		});
		const provider = { synthesize } satisfies TTSProvider;
		await expect(
			new RetryingTts(provider).synthesize("hello"),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(synthesize).toHaveBeenCalledTimes(1);
	});
});

describe("speech preparation", () => {
	it("normalizes pauses, quotes, and initialisms for Aura", () => {
		expect(prepareTextForSpeech('"AI" -- DDoS; APIs')).toBe(
			"A.I... D D O S... A P I's",
		);
	});
});
