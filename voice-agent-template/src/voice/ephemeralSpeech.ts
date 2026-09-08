export const FILLER_SPEECH_DELAY_MS = 500;

export function shouldAnnounceEphemeralSpeakingStatus(
	phase: "filler" | "recovery",
): boolean {
	return phase === "recovery";
}

const FILLER_PHRASES = [
	"One moment.",
	"Let me check on that.",
	"Give me a second.",
] as const;

const RECOVERY_PHRASES = [
	"Sorry, I couldn't come up with an answer. Could you try asking that another way?",
] as const;

export function shouldBeginFillerSpeech(
	streamPartType: string,
	alreadyStarted: boolean,
): boolean {
	return streamPartType === "tool-call" && !alreadyStarted;
}

export interface EphemeralPhraseRotation {
	fillerIndex: number;
	recoveryIndex: number;
}

export function createEphemeralPhraseRotation(): EphemeralPhraseRotation {
	return { fillerIndex: -1, recoveryIndex: -1 };
}

function pickPhrase(
	phrases: readonly string[],
	lastIndex: number,
): { phrase: string; index: number } {
	if (phrases.length === 1) return { phrase: phrases[0], index: 0 };
	const index = (lastIndex + 1) % phrases.length;
	return { phrase: phrases[index], index };
}

export function pickFillerPhrase(rotation: EphemeralPhraseRotation): string {
	const picked = pickPhrase(FILLER_PHRASES, rotation.fillerIndex);
	rotation.fillerIndex = picked.index;
	return picked.phrase;
}

export function pickRecoveryPhrase(rotation: EphemeralPhraseRotation): string {
	const picked = pickPhrase(RECOVERY_PHRASES, rotation.recoveryIndex);
	rotation.recoveryIndex = picked.index;
	return picked.phrase;
}
