export const FIXED_VOICE_CONFIG = {
	agentId: "arya",
	agentName: "Arya",
	sttModel: "flux",
	llmModel: "@cf/openai/gpt-oss-20b",
	ttsModel: "aura-1",
	ttsModelId: "@cf/deepgram/aura-1",
	ttsVoice: "asteria",
} as const;

export const VOICE_AGENT_OPTIONS = {
	historyLimit: 10,
} as const;

export const VOICE_LLM_OPTIONS = {
	maxOutputTokens: 10_000,
} as const;

export const VOICE_STT_KEYTERMS = [
	"Cloudflare",
	"Workers",
	"Durable Objects",
] as const;

export const MAX_PROMPT_LENGTH = 20_000;
export const VOICE_CONFIG_MESSAGE_MAX_LENGTH = 4_096;

interface FixedVoiceConfigMessage {
	type: "voice_config";
	agentId: typeof FIXED_VOICE_CONFIG.agentId;
	sttModel: typeof FIXED_VOICE_CONFIG.sttModel;
	llmModel: typeof FIXED_VOICE_CONFIG.llmModel;
	ttsModel: typeof FIXED_VOICE_CONFIG.ttsModel;
	ttsVoice: typeof FIXED_VOICE_CONFIG.ttsVoice;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isFixedVoiceConfigMessage(
	value: unknown,
): value is FixedVoiceConfigMessage {
	return (
		isRecord(value) &&
		value.type === "voice_config" &&
		value.agentId === FIXED_VOICE_CONFIG.agentId &&
		value.sttModel === FIXED_VOICE_CONFIG.sttModel &&
		value.llmModel === FIXED_VOICE_CONFIG.llmModel &&
		value.ttsModel === FIXED_VOICE_CONFIG.ttsModel &&
		value.ttsVoice === FIXED_VOICE_CONFIG.ttsVoice
	);
}
