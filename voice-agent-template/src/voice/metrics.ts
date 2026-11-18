import type { FinishReason } from "ai";
import { WorkersLogger } from "workers-tagged-logger";

export type VoiceInputSource = "stt" | "text";
export type VoiceGuardrailDirection = "input" | "output";
export type VoiceGuardrailOutcome = "allowed" | "blocked" | "error" | "aborted";
export type VoiceEphemeralPhase = "filler" | "recovery";
export type VoiceEphemeralOutcome = "succeeded" | "failed" | "aborted";
export type VoiceToolsOutcome = "ready" | "timeout" | "aborted" | "error";
export type VoiceBindingFallbackOutcome = "succeeded" | "failed" | "aborted";
export type VoiceTextStreamOutcome =
	| "output"
	| "error"
	| "no_output"
	| "aborted";
export type VoiceBindingResponseShape =
	| "stream"
	| "chat-completion"
	| "native"
	| "responses-api"
	| "empty"
	| "unknown"
	| "error";
export type VoiceToolExecutionOutcome =
	| "succeeded"
	| "timeout"
	| "error"
	| "aborted";

type VoiceMetricStage =
	| "input"
	| "guardrail"
	| "tools"
	| "model"
	| "ephemeral_speech"
	| "sdk_output";
type VoiceMetricEventStatus =
	| "observed"
	| "succeeded"
	| "degraded"
	| "blocked"
	| "failed"
	| "aborted";
type VoiceMetricFlowStatus = "active" | "handed_off" | "stopped";

interface VoiceMetricLifecycle {
	stage: VoiceMetricStage;
	eventStatus: VoiceMetricEventStatus;
	flowStatus: VoiceMetricFlowStatus;
	nextStage: VoiceMetricStage | null;
	uiErrorCode?: "blocked" | "protocol";
}

type VoiceMetric = VoiceMetricLifecycle &
	(
		| {
				event: "voice_agent_on_turn_input";
				transcriptLength: number;
		  }
		| {
				event: "voice_agent_ephemeral_speech";
				phase: VoiceEphemeralPhase;
				attemptCount: number;
				durationMs: number;
		  }
		| {
				event: "voice_agent_guardrail_check";
				direction: VoiceGuardrailDirection;
				outcome: VoiceGuardrailOutcome;
				transcriptLength: number;
				durationMs: number;
		  }
		| {
				event: "voice_agent_docs_tools_ready";
				outcome: VoiceToolsOutcome;
				requestedToolCount: number;
				resolvedToolCount: number;
				durationMs: number;
		  }
		| {
				event: "voice_agent_llm_binding_fallback";
				outcome: VoiceBindingFallbackOutcome;
				llmModel: string;
				initialResponseShape: VoiceBindingResponseShape;
				retryResponseShape: VoiceBindingResponseShape;
				durationMs: number;
		  }
		| {
				event: "voice_agent_tool_call";
				llmModel: string;
				toolName: string;
				elapsedSinceFlowMs: number;
		  }
		| {
				event: "voice_agent_tool_execution";
				toolName: string;
				attempt: number;
				outcome: VoiceToolExecutionOutcome;
				terminal: boolean;
				durationMs: number;
		  }
		| {
				event: "voice_agent_llm_step_completed";
				llmModel: string;
				stepNumber: number;
				finishReason: FinishReason;
				outputTokens: number | null;
				textLength: number;
				reasoningLength: number;
				toolCallCount: number;
				maxOutputTokens: number;
				durationMs: number;
				elapsedSinceFlowMs: number;
		  }
		| {
				event: "voice_agent_text_stream_received";
				llmModel: string;
				toolCount: number;
				toolCallCount: number;
				elapsedSinceFlowMs: number;
		  }
		| {
				event: "voice_agent_text_stream_completed";
				outcome: VoiceTextStreamOutcome;
				llmModel: string;
				toolCount: number;
				toolCallCount: number;
				textChunkCount: number;
				textLength: number;
				reasoningLength: number;
				finishReason: FinishReason | null;
				elapsedSinceFlowMs: number;
		  }
	);

export interface VoiceMetricContext {
	readonly connectionId: string;
	readonly flowId: string;
	readonly startedAt: number;
	readonly agentId: "arya";
	readonly inputSource: VoiceInputSource;
}

export interface VoiceTextStreamMetricSummary {
	toolCallCount: number;
	textChunkCount: number;
	textLength: number;
	reasoningLength: number;
	finishReason: FinishReason | null;
	elapsedSinceFlowMs: number;
}

const messages = {
	voice_agent_on_turn_input: "voice input received",
	voice_agent_ephemeral_speech: "voice ephemeral speech completed",
	voice_agent_guardrail_check: "voice guardrail check completed",
	voice_agent_docs_tools_ready: "voice docs tools readiness completed",
	voice_agent_llm_binding_fallback:
		"voice LLM binding retried without streaming",
	voice_agent_tool_call: "voice tool called",
	voice_agent_tool_execution: "voice tool execution attempt completed",
	voice_agent_llm_step_completed: "voice LLM step completed",
	voice_agent_text_stream_received: "voice text stream first received",
	voice_agent_text_stream_completed: "voice text stream completed",
} satisfies Record<VoiceMetric["event"], string>;

const logger = new WorkersLogger();
const flowSequences = new WeakMap<VoiceMetricContext, number>();

export const VOICE_INPUT_LIFECYCLE = {
	stage: "input",
	eventStatus: "observed",
	flowStatus: "active",
	nextStage: "guardrail",
} as const satisfies VoiceMetricLifecycle;

export function elapsedMsSince(startedAt: number): number {
	return Math.round(performance.now() - startedAt);
}

export function createVoiceMetricContext(
	connectionId: string,
	inputSource: VoiceInputSource,
): VoiceMetricContext {
	const context = Object.freeze({
		connectionId,
		flowId: crypto.randomUUID(),
		startedAt: performance.now(),
		agentId: "arya" as const,
		inputSource,
	});
	flowSequences.set(context, 0);
	return context;
}

export function voiceGuardrailLifecycle(
	outcome: VoiceGuardrailOutcome,
	direction: VoiceGuardrailDirection = "input",
): VoiceMetricLifecycle {
	if (outcome === "allowed") {
		return {
			stage: "guardrail",
			eventStatus: "succeeded",
			flowStatus: "active",
			nextStage: direction === "input" ? "tools" : "sdk_output",
		};
	}
	if (outcome === "aborted") {
		return {
			stage: "guardrail",
			eventStatus: "aborted",
			flowStatus: "stopped",
			nextStage: null,
		};
	}
	return {
		stage: "guardrail",
		eventStatus: outcome === "blocked" ? "blocked" : "failed",
		flowStatus: "stopped",
		nextStage: null,
		uiErrorCode: "blocked",
	};
}

export function voiceToolsLifecycle(
	outcome: VoiceToolsOutcome,
	requestedToolCount: number,
	resolvedToolCount: number,
): VoiceMetricLifecycle {
	if (outcome === "aborted") {
		return {
			stage: "tools",
			eventStatus: "aborted",
			flowStatus: "stopped",
			nextStage: null,
		};
	}
	return {
		stage: "tools",
		eventStatus:
			outcome === "ready" && requestedToolCount > 0 && resolvedToolCount > 0
				? "succeeded"
				: "degraded",
		flowStatus: "active",
		nextStage: "model",
	};
}

export function voiceBindingFallbackLifecycle(
	outcome: VoiceBindingFallbackOutcome,
): VoiceMetricLifecycle {
	if (outcome === "succeeded") {
		return {
			stage: "model",
			eventStatus: "degraded",
			flowStatus: "active",
			nextStage: "model",
		};
	}
	if (outcome === "aborted") {
		return {
			stage: "model",
			eventStatus: "aborted",
			flowStatus: "stopped",
			nextStage: null,
		};
	}
	return {
		stage: "model",
		eventStatus: "failed",
		flowStatus: "stopped",
		nextStage: null,
		uiErrorCode: "protocol",
	};
}

export function voiceLlmStepLifecycle(
	finishReason: FinishReason,
): VoiceMetricLifecycle {
	return finishReason === "error"
		? {
				stage: "model",
				eventStatus: "failed",
				flowStatus: "stopped",
				nextStage: null,
				uiErrorCode: "protocol",
			}
		: {
				stage: "model",
				eventStatus: "succeeded",
				flowStatus: "active",
				nextStage: "model",
			};
}

export function voiceTextStreamLifecycle(
	outcome: VoiceTextStreamOutcome,
): VoiceMetricLifecycle {
	if (outcome === "output") {
		return {
			stage: "model",
			eventStatus: "succeeded",
			flowStatus: "handed_off",
			nextStage: "sdk_output",
		};
	}
	if (outcome === "aborted") {
		return {
			stage: "model",
			eventStatus: "aborted",
			flowStatus: "stopped",
			nextStage: null,
		};
	}
	return {
		stage: "model",
		eventStatus: "failed",
		flowStatus: "stopped",
		nextStage: null,
		uiErrorCode: "protocol",
	};
}

export function voiceEphemeralLifecycle(
	outcome: VoiceEphemeralOutcome,
	flowStopped: boolean,
): VoiceMetricLifecycle {
	return {
		stage: "ephemeral_speech",
		eventStatus: outcome,
		flowStatus: flowStopped ? "stopped" : "active",
		nextStage: flowStopped ? null : "model",
	};
}

export function hasVoiceTextOutput(text: string): boolean {
	return text.trim().length > 0;
}

export function isCurrentVoiceApproval(
	expectedEpoch: number,
	currentEpoch: number,
	connectionActive: boolean,
): boolean {
	return connectionActive && expectedEpoch === currentEpoch;
}

export function createVoiceTextStreamFinalizer(
	context: VoiceMetricContext,
	llmModel: string,
	toolCount: number,
): (
	outcome: VoiceTextStreamOutcome,
	summary: VoiceTextStreamMetricSummary,
) => void {
	let finalized = false;
	return (outcome, summary) => {
		if (finalized) return;
		finalized = true;
		logVoiceMetric(context, {
			event: "voice_agent_text_stream_completed",
			...voiceTextStreamLifecycle(outcome),
			outcome,
			llmModel,
			toolCount,
			...summary,
		});
	};
}

export function logVoiceMetric(
	context: VoiceMetricContext,
	metric: VoiceMetric,
): void {
	try {
		const previousSequence = flowSequences.get(context);
		if (previousSequence === undefined) return;
		const flowSequence = previousSequence + 1;
		logger
			.withFields({
				...metric,
				schemaVersion: 1,
				timestamp: new Date().toISOString(),
				connectionId: context.connectionId,
				flowId: context.flowId,
				flowSequence,
				agentId: context.agentId,
				inputSource: context.inputSource,
			})
			.info(messages[metric.event]);
		flowSequences.set(context, flowSequence);
	} catch {
		// Observability is best-effort and must not affect the voice pipeline.
	}
}
