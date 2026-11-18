import type { TTSProvider } from "@cloudflare/voice";
import { WorkersLogger } from "workers-tagged-logger";

const logger = new WorkersLogger();

export type TtsAttemptObserver = (attempt: number) => void;

function isAbortError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"name" in error &&
		error.name === "AbortError"
	);
}

export class RetryingTts implements TTSProvider {
	constructor(private readonly provider: TTSProvider) {}

	async synthesize(
		text: string,
		signal?: AbortSignal,
		onAttempt?: TtsAttemptObserver,
	): Promise<ArrayBuffer | null> {
		let lastError: unknown;
		let failureKind: "empty_audio" | "exception" = "empty_audio";
		for (let attempt = 1; attempt <= 2; attempt += 1) {
			signal?.throwIfAborted();
			onAttempt?.(attempt);

			try {
				const audio = await this.provider.synthesize(text, signal);
				signal?.throwIfAborted();
				if (audio !== null && audio.byteLength > 0) return audio;
				failureKind = "empty_audio";
			} catch (error) {
				if (signal?.aborted) signal.throwIfAborted();
				if (isAbortError(error)) throw error;
				failureKind = "exception";
				lastError = error;
			}
		}

		logger
			.withTags({
				attemptCount: 2,
				failureKind,
				error: lastError instanceof Error ? lastError.message : undefined,
			})
			.warn("voice TTS attempts exhausted");
		return null;
	}
}
