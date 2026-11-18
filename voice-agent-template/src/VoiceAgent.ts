import { Agent, type Connection, type WSMessage } from "agents";
import {
	WorkersAIFluxSTT,
	WorkersAITTS,
	withVoice,
	type Transcriber,
	type VoiceTurnContext,
} from "@cloudflare/voice";
import { stepCountIs, streamText, type FinishReason } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { WorkersLogger } from "workers-tagged-logger";
import { checkPrompt } from "./voice/checkPrompt";
import {
	FIXED_VOICE_CONFIG,
	MAX_PROMPT_LENGTH,
	VOICE_AGENT_OPTIONS,
	VOICE_CONFIG_MESSAGE_MAX_LENGTH,
	VOICE_LLM_OPTIONS,
	VOICE_STT_KEYTERMS,
	isFixedVoiceConfigMessage,
} from "./voice/config";
import {
	CLOUDFLARE_DOCS_SERVER,
	DOCS_TOOL_COUNT,
	DOCS_TOOLS_TURN_WAIT_MS,
	resolveDocsTools,
	waitForDocsTools,
	type DocsToolServer,
} from "./voice/docsTools";
import {
	FILLER_SPEECH_DELAY_MS,
	createEphemeralPhraseRotation,
	pickFillerPhrase,
	pickRecoveryPhrase,
	shouldAnnounceEphemeralSpeakingStatus,
	shouldBeginFillerSpeech,
} from "./voice/ephemeralSpeech";
import {
	CONVERSATION_RETENTION_MS,
	claimCall,
	nextConversationCleanupDeadline,
	normalizeConversationCleanupScheduleTime,
	releaseCall,
} from "./voice/lifecycle";
import {
	VOICE_INPUT_LIFECYCLE,
	createVoiceMetricContext,
	createVoiceTextStreamFinalizer,
	elapsedMsSince,
	hasVoiceTextOutput,
	isCurrentVoiceApproval,
	logVoiceMetric,
	voiceEphemeralLifecycle,
	voiceGuardrailLifecycle,
	voiceLlmStepLifecycle,
	voiceToolsLifecycle,
	type VoiceEphemeralOutcome,
	type VoiceEphemeralPhase,
	type VoiceGuardrailOutcome,
	type VoiceInputSource,
	type VoiceMetricContext,
	type VoiceTextStreamOutcome,
} from "./voice/metrics";
import {
	guardVoiceOutput,
	type OutputGuardrailState,
} from "./voice/outputGuardrail";
import { RetryingTts } from "./voice/retryingTts";
import { prepareTextForSpeech } from "./voice/speechPreparation";
import {
	buildVoiceGreeting,
	buildVoiceSystemPrompt,
} from "./voice/trustedAgent";
import { createVoiceAIBinding } from "./voice/voiceAIBinding";

const logger = new WorkersLogger();
const VoiceAgentBase = withVoice(Agent, VOICE_AGENT_OPTIONS);

interface VoiceEphemeralSpeechState {
	timer: ReturnType<typeof setTimeout>;
	controller: AbortController;
	armedAt: number;
	phase: VoiceEphemeralPhase;
	metricContext: VoiceMetricContext;
	attemptCount: number;
	metricEmitted: boolean;
	spoken: boolean;
}

interface ApprovedSpeech {
	transcript: string;
	metricContext: VoiceMetricContext;
}

interface ActiveOutputGuardrail {
	metricContext: VoiceMetricContext;
	signal: AbortSignal;
	state: OutputGuardrailState;
}

interface ConversationCleanupPayload {
	deadlineMs: number;
}

export class VoiceAgent extends VoiceAgentBase<Env> {
	#activeCallId: string | null = null;
	#approvedSpeech = new Map<string, ApprovedSpeech>();
	#approvalEpoch = new Map<string, number>();
	#docsToolConnection: Promise<void> | null = null;
	#endedCallIds = new Set<string>();
	#ephemeralPhraseRotation = createEphemeralPhraseRotation();
	#ephemeralSpeech = new Map<string, VoiceEphemeralSpeechState>();
	#inputGuardrailControllers = new Map<string, AbortController>();
	#outputGuardrails = new Map<string, ActiveOutputGuardrail>();
	#rejectedConfiguration = new Set<string>();
	#retentionScheduleQueue: Promise<void> = Promise.resolve();

	tts = this.#buildTts();

	async onStart(): Promise<void> {
		logger
			.withTags({ agentId: FIXED_VOICE_CONFIG.agentId })
			.info("voice agent initialized");
		const oldestTimestamp = this.#oldestConversationTimestamp();
		if (oldestTimestamp !== null) {
			await this.#ensureConversationCleanupSchedule(
				nextConversationCleanupDeadline(oldestTimestamp),
			);
		}
	}

	async beforeCallStart(connection: Connection): Promise<boolean> {
		if (this.#rejectedConfiguration.has(connection.id)) {
			this.#notify(connection, {
				type: "voice_config_error",
				reason: "This template uses a fixed voice configuration.",
			});
			return false;
		}

		const connectedIds = new Set(
			[...this.getConnections()].map((candidate) => candidate.id),
		);
		for (const endedCallId of this.#endedCallIds) {
			if (!connectedIds.has(endedCallId)) {
				this.#endedCallIds.delete(endedCallId);
			}
		}
		this.#endedCallIds.delete(connection.id);

		const previousCallId = this.#activeCallId;
		const claim = claimCall(previousCallId, connection.id);
		this.#activeCallId = claim.activeCallId;
		try {
			await this.#ensureConversationCleanupSchedule(
				nextConversationCleanupDeadline(this.#oldestConversationTimestamp()),
			);
		} catch (error) {
			if (this.#activeCallId === connection.id) {
				this.#activeCallId =
					previousCallId !== null && !this.#endedCallIds.has(previousCallId)
						? previousCallId
						: null;
			}
			logger
				.withTags({
					connectionId: connection.id,
					error: error instanceof Error ? error.message : String(error),
				})
				.error("voice conversation retention schedule failed");
			this.#notify(connection, {
				type: "voice_config_error",
				reason: "Conversation privacy setup unavailable. Please try again.",
			});
			return false;
		}

		if (this.#activeCallId !== connection.id) return false;
		if (claim.replacedCallId) {
			const previous = [...this.getConnections()].find(
				(candidate) => candidate.id === claim.replacedCallId,
			);
			if (previous) this.forceEndCall(previous);
		}

		this.#invalidateApproval(connection.id);
		this.tts = this.#buildTts();
		this.ctx.waitUntil(this.#prepareDocsTool());
		return true;
	}

	onCallEnd(connection: Connection): void {
		this.#endedCallIds.add(connection.id);
		const release = releaseCall(this.#activeCallId, connection.id);
		this.#activeCallId = release.activeCallId;
		this.#abortApprovedSpeech(connection.id);
		this.#abortInputGuardrail(connection.id);
		this.#invalidateApproval(connection.id);
		this.#teardownEphemeralSpeech(connection, true);
		this.#outputGuardrails.delete(connection.id);
		if (release.released) {
			this.ctx.waitUntil(
				Promise.resolve().then(() => this.#clearOwnedConversationHistory()),
			);
		}
	}

	onClose(connection: Connection): void {
		this.onCallEnd(connection);
		this.#rejectedConfiguration.delete(connection.id);
		this.#approvalEpoch.delete(connection.id);
		this.#outputGuardrails.delete(connection.id);
	}

	onInterrupt(connection: Connection): void {
		this.#abortApprovedSpeech(connection.id);
		this.#abortInputGuardrail(connection.id);
		this.#invalidateApproval(connection.id);
		this.#teardownEphemeralSpeech(connection, true);
		this.#outputGuardrails.delete(connection.id);
	}

	onMessage(connection: Connection, message: WSMessage): void {
		if (typeof message !== "string") return;
		if (message.length > VOICE_CONFIG_MESSAGE_MAX_LENGTH) {
			this.#rejectConfiguration(
				connection,
				"Configuration message is too large",
			);
			return;
		}

		try {
			const data: unknown = JSON.parse(message);
			if (
				typeof data !== "object" ||
				data === null ||
				!("type" in data) ||
				data.type !== "voice_config"
			) {
				return;
			}
			if (!isFixedVoiceConfigMessage(data)) {
				this.#rejectConfiguration(
					connection,
					"Agent and pipeline selection are disabled",
				);
				return;
			}

			this.#rejectedConfiguration.delete(connection.id);
			this.#notify(connection, {
				type: "voice_identity",
				connectionId: connection.id,
			});
			this.ctx.waitUntil(this.#prepareDocsTool());
		} catch {
			// Non-JSON custom messages are not part of this Agent contract.
		}
	}

	onRequest(request: Request): Response {
		if (request.method !== "GET" && request.method !== "HEAD") {
			return new Response("Method not allowed", {
				status: 405,
				headers: { allow: "GET, HEAD" },
			});
		}
		return Response.json({
			ok: true,
			agent: FIXED_VOICE_CONFIG.agentId,
			pipeline: {
				stt: FIXED_VOICE_CONFIG.sttModel,
				llm: FIXED_VOICE_CONFIG.llmModel,
				tts: FIXED_VOICE_CONFIG.ttsModel,
				voice: FIXED_VOICE_CONFIG.ttsVoice,
			},
		});
	}

	async onCallStart(connection: Connection): Promise<void> {
		try {
			await this.speak(connection, buildVoiceGreeting());
		} catch (error) {
			if (error instanceof Error && error.name === "AbortError") return;
			logger
				.withTags({
					connectionId: connection.id,
					error: error instanceof Error ? error.message : String(error),
					stack: error instanceof Error ? error.stack : undefined,
				})
				.error("voice greeting failed");
		}
	}

	createTranscriber(_connection: Connection): Transcriber {
		return new WorkersAIFluxSTT(this.env.AI, {
			keyterms: [...VOICE_STT_KEYTERMS],
		});
	}

	async onTurn(transcript: string, context: VoiceTurnContext) {
		this.#abortInputGuardrail(context.connection.id);
		this.#teardownEphemeralSpeech(context.connection, true);
		const trimmed = transcript.trim();
		if (trimmed.length === 0) {
			this.#abortApprovedSpeech(context.connection.id);
			this.#invalidateApproval(context.connection.id);
			return "";
		}

		try {
			await this.#ensureConversationCleanupSchedule(
				nextConversationCleanupDeadline(this.#oldestConversationTimestamp()),
			);
		} catch (error) {
			logger
				.withTags({
					connectionId: context.connection.id,
					error: error instanceof Error ? error.message : String(error),
				})
				.error("voice conversation retention schedule failed during turn");
			this.#abortApprovedSpeech(context.connection.id);
			this.#invalidateApproval(context.connection.id);
			this.#teardownEphemeralSpeech(context.connection, true);
			this.#discardLatestUserMessage(trimmed);
			this.#notify(context.connection, {
				type: "voice_config_error",
				reason: "Conversation privacy setup unavailable. Please try again.",
			});
			return "";
		}

		const approvedSpeech = this.#approvedSpeech.get(context.connection.id);
		const approvedSpeechMatches = approvedSpeech?.transcript === trimmed;
		let metricContext: VoiceMetricContext;
		if (approvedSpeechMatches) {
			metricContext = approvedSpeech.metricContext;
			this.#approvedSpeech.delete(context.connection.id);
		} else {
			this.#abortApprovedSpeech(context.connection.id);
			this.#invalidateApproval(context.connection.id);
			metricContext = this.#beginVoiceFlow(
				context.connection,
				"text",
				trimmed.length,
			);
		}

		if (!approvedSpeechMatches) {
			const checked = await this.#validatePrompt(
				trimmed,
				context.connection,
				metricContext,
				context.signal,
			);
			if (!checked) {
				this.#discardLatestUserMessage(trimmed);
				this.#teardownEphemeralSpeech(context.connection, true);
				return "";
			}
		}

		if (context.signal.aborted) {
			this.#logDocsToolsAborted(metricContext);
			this.#teardownEphemeralSpeech(context.connection, true);
			return "";
		}

		const toolWaitStartedAt = performance.now();
		const toolWait = await waitForDocsTools(
			this.#readyDocsTool(),
			DOCS_TOOLS_TURN_WAIT_MS,
			context.signal,
		);
		if (toolWait === "aborted" || context.signal.aborted) {
			this.#logDocsToolsAborted(
				metricContext,
				elapsedMsSince(toolWaitStartedAt),
			);
			this.#teardownEphemeralSpeech(context.connection, true);
			return "";
		}

		const toolRuntime = resolveDocsTools(this.mcp, {
			onCloudflareDocsAttempt: ({ attempt, outcome, terminal, durationMs }) => {
				const aborted = outcome === "aborted";
				logVoiceMetric(metricContext, {
					event: "voice_agent_tool_execution",
					stage: "tools",
					eventStatus:
						outcome === "succeeded"
							? "succeeded"
							: aborted
								? "aborted"
								: terminal
									? "degraded"
									: "failed",
					flowStatus: aborted ? "stopped" : "active",
					nextStage: aborted ? null : terminal ? "model" : "tools",
					toolName: "cloudflare-docs-search",
					attempt,
					outcome,
					terminal,
					durationMs,
				});
			},
		});
		const resolvedToolCount = Object.keys(toolRuntime.tools).length;
		logVoiceMetric(metricContext, {
			event: "voice_agent_docs_tools_ready",
			...voiceToolsLifecycle(toolWait, DOCS_TOOL_COUNT, resolvedToolCount),
			outcome: toolWait,
			requestedToolCount: DOCS_TOOL_COUNT,
			resolvedToolCount,
			durationMs: elapsedMsSince(toolWaitStartedAt),
		});

		const llmModel = FIXED_VOICE_CONFIG.llmModel;
		const workersai = createWorkersAI({
			binding: createVoiceAIBinding(this.env.AI, metricContext, llmModel),
		});
		this.#outputGuardrails.set(context.connection.id, {
			metricContext,
			signal: context.signal,
			state: { blocked: false, fallbackUsed: false },
		});

		let stepStartedAt = performance.now();
		const result = streamText({
			model: workersai(llmModel, { reasoning_effort: "low" }),
			system: buildVoiceSystemPrompt(toolRuntime.promptRules),
			messages: [
				...context.messages.map(({ role, content }) => ({
					role: role as "user" | "assistant",
					content,
				})),
				{ role: "user" as const, content: trimmed },
			],
			tools: toolRuntime.tools,
			prepareStep: ({ stepNumber }) =>
				stepNumber === toolRuntime.maxSteps - 1
					? { toolChoice: "none" }
					: undefined,
			stopWhen: stepCountIs(toolRuntime.maxSteps),
			abortSignal: context.signal,
			...VOICE_LLM_OPTIONS,
			onStepFinish: ({
				stepNumber,
				finishReason,
				usage,
				text,
				reasoningText,
				toolCalls,
			}) => {
				const stepFinishedAt = performance.now();
				logVoiceMetric(metricContext, {
					event: "voice_agent_llm_step_completed",
					...voiceLlmStepLifecycle(finishReason),
					llmModel,
					stepNumber,
					finishReason,
					outputTokens: usage.outputTokens ?? null,
					textLength: text.length,
					reasoningLength: reasoningText?.length ?? 0,
					toolCallCount: toolCalls.length,
					maxOutputTokens: VOICE_LLM_OPTIONS.maxOutputTokens,
					durationMs: Math.round(stepFinishedAt - stepStartedAt),
					elapsedSinceFlowMs: Math.round(
						stepFinishedAt - metricContext.startedAt,
					),
				});
				stepStartedAt = stepFinishedAt;
			},
		});

		const teardownEphemeralSpeech = (flowStopped: boolean) =>
			this.#teardownEphemeralSpeech(context.connection, flowStopped);
		const beginFillerSpeech = () =>
			this.#beginEphemeralSpeech(
				context.connection,
				metricContext,
				"filler",
				FILLER_SPEECH_DELAY_MS,
			);
		const beginRecoverySpeech = () =>
			this.#beginEphemeralSpeech(
				context.connection,
				metricContext,
				"recovery",
				0,
			);
		const finalizeTextStream = createVoiceTextStreamFinalizer(
			metricContext,
			llmModel,
			resolvedToolCount,
		);

		return (async function* () {
			let hasOutputText = false;
			let textChunkCount = 0;
			let textLength = 0;
			let toolCallCount = 0;
			let fillerStarted = false;
			let reasoningLength = 0;
			let finishReason: FinishReason | null = null;
			let completionOutcome: VoiceTextStreamOutcome | null = null;
			let streamExhausted = false;

			try {
				for await (const part of result.fullStream) {
					if (part.type === "error") completionOutcome = "error";
					if (part.type === "abort") completionOutcome = "aborted";
					if (part.type === "reasoning-delta") {
						reasoningLength += part.text.length;
					}
					if (part.type === "finish") {
						finishReason = part.finishReason;
						if (finishReason === "error") {
							completionOutcome = "error";
						}
					}
					if (shouldBeginFillerSpeech(part.type, fillerStarted)) {
						fillerStarted = true;
						beginFillerSpeech();
					}
					if (part.type === "tool-call") {
						toolCallCount += 1;
						logVoiceMetric(metricContext, {
							event: "voice_agent_tool_call",
							stage: "tools",
							eventStatus: "observed",
							flowStatus: "active",
							nextStage: "model",
							llmModel,
							toolName: part.toolName,
							elapsedSinceFlowMs: elapsedMsSince(metricContext.startedAt),
						});
					}
					if (part.type === "text-delta" && part.text.length > 0) {
						textChunkCount += 1;
						textLength += part.text.length;
						if (!hasOutputText && hasVoiceTextOutput(part.text)) {
							hasOutputText = true;
							teardownEphemeralSpeech(false);
							logVoiceMetric(metricContext, {
								event: "voice_agent_text_stream_received",
								stage: "model",
								eventStatus: "observed",
								flowStatus: "active",
								nextStage: "model",
								llmModel,
								toolCount: resolvedToolCount,
								toolCallCount,
								elapsedSinceFlowMs: elapsedMsSince(metricContext.startedAt),
							});
						}
					}
					yield part;
				}
				streamExhausted = true;
				completionOutcome = context.signal.aborted
					? "aborted"
					: (completionOutcome ?? (hasOutputText ? "output" : "no_output"));
			} catch (error) {
				completionOutcome = context.signal.aborted ? "aborted" : "error";
				throw error;
			} finally {
				completionOutcome = context.signal.aborted
					? "aborted"
					: (completionOutcome ??
						(streamExhausted
							? hasOutputText
								? "output"
								: "no_output"
							: "error"));
				finalizeTextStream(completionOutcome, {
					toolCallCount,
					textChunkCount,
					textLength,
					reasoningLength,
					finishReason,
					elapsedSinceFlowMs: elapsedMsSince(metricContext.startedAt),
				});
				teardownEphemeralSpeech(completionOutcome !== "output");
			}

			if (completionOutcome === "no_output") {
				const error = new Error(
					"Voice LLM stream completed without text output",
				);
				logger
					.withTags({
						model: llmModel,
						connectionId: context.connection.id,
						error: error.message,
						stack: error.stack,
						finishReason,
						reasoningLength,
						toolCallCount,
					})
					.error("voice LLM stream completed without text");
				beginRecoverySpeech();
			}
		})();
	}

	async afterTranscribe(
		transcript: string,
		connection: Connection,
	): Promise<string | null> {
		this.#abortInputGuardrail(connection.id);
		const trimmed = transcript.trim();
		if (trimmed.length === 0) {
			this.#abortApprovedSpeech(connection.id);
			this.#invalidateApproval(connection.id);
			return null;
		}

		this.#abortApprovedSpeech(connection.id);
		const guardrailController = new AbortController();
		this.#inputGuardrailControllers.set(connection.id, guardrailController);
		const approvalEpoch = this.#invalidateApproval(connection.id);
		const metricContext = this.#beginVoiceFlow(
			connection,
			"stt",
			trimmed.length,
		);
		const checked = await this.#validatePrompt(
			trimmed,
			connection,
			metricContext,
			guardrailController.signal,
		).finally(() => {
			if (
				this.#inputGuardrailControllers.get(connection.id) ===
				guardrailController
			) {
				this.#inputGuardrailControllers.delete(connection.id);
			}
		});
		if (!checked) return null;

		if (
			isCurrentVoiceApproval(
				approvalEpoch,
				this.#approvalEpoch.get(connection.id) ?? 0,
				this.#activeCallId === connection.id,
			)
		) {
			this.#approvedSpeech.set(connection.id, {
				transcript: checked,
				metricContext,
			});
		} else {
			this.#logDocsToolsAborted(metricContext);
			return null;
		}
		return checked;
	}

	async beforeSynthesize(
		text: string,
		connection: Connection,
	): Promise<string | null> {
		const activeGuardrail = this.#outputGuardrails.get(connection.id);
		if (!activeGuardrail) return prepareTextForSpeech(text);

		const startedAt = performance.now();
		const result = await guardVoiceOutput(
			text,
			activeGuardrail.state,
			activeGuardrail.signal,
			(candidate, signal) => checkPrompt(this.env.AI, candidate, signal),
		);
		const outcome: VoiceGuardrailOutcome = result.outcome;
		logVoiceMetric(activeGuardrail.metricContext, {
			event: "voice_agent_guardrail_check",
			...voiceGuardrailLifecycle(outcome, "output"),
			direction: "output",
			outcome,
			transcriptLength: text.length,
			durationMs: elapsedMsSince(startedAt),
		});

		if (
			(result.outcome === "blocked" || result.outcome === "error") &&
			result.notify
		) {
			logger
				.withTags({
					connectionId: connection.id,
					outcome: result.outcome,
					categories: result.categories ? [...result.categories] : undefined,
				})
				.warn("voice generated sentence blocked by guardrails");
			this.#notify(connection, {
				type: "blocked",
				reason: result.message,
				...(result.categories ? { categories: result.categories } : {}),
			});
		}
		return result.text === null ? null : prepareTextForSpeech(result.text);
	}

	afterSynthesize(
		audio: ArrayBuffer | null,
		_text: string,
		connection: Connection,
	): ArrayBuffer | null {
		if (!audio || audio.byteLength === 0) {
			this.#notify(connection, {
				type: "voice_output_error",
				reason: "Audio response unavailable. Please try again.",
			});
		}
		return audio;
	}

	async cleanupConversationHistory(
		_payload: ConversationCleanupPayload,
	): Promise<void> {
		const startedAt = performance.now();
		if (this.#hasConversationHistory()) {
			const cutoffExclusive = Date.now() - CONVERSATION_RETENTION_MS + 1_000;
			this.sql`
				DELETE FROM cf_voice_messages
				WHERE timestamp < ${cutoffExclusive}
			`;
		}
		const oldestTimestamp = this.#oldestConversationTimestamp();
		if (oldestTimestamp !== null) {
			await this.#ensureConversationCleanupSchedule(
				nextConversationCleanupDeadline(oldestTimestamp),
			);
		}
		logger
			.withTags({ durationMs: elapsedMsSince(startedAt) })
			.info("voice conversation retention cleanup complete");
	}

	#buildTts(): RetryingTts {
		return new RetryingTts(
			new WorkersAITTS(this.env.AI, {
				model: FIXED_VOICE_CONFIG.ttsModelId,
				speaker: FIXED_VOICE_CONFIG.ttsVoice,
			}),
		);
	}

	#invalidateApproval(connectionId: string): number {
		const nextEpoch = (this.#approvalEpoch.get(connectionId) ?? 0) + 1;
		this.#approvalEpoch.set(connectionId, nextEpoch);
		return nextEpoch;
	}

	#beginVoiceFlow(
		connection: Connection,
		inputSource: VoiceInputSource,
		transcriptLength: number,
	): VoiceMetricContext {
		const metricContext = createVoiceMetricContext(connection.id, inputSource);
		logVoiceMetric(metricContext, {
			event: "voice_agent_on_turn_input",
			...VOICE_INPUT_LIFECYCLE,
			transcriptLength,
		});
		return metricContext;
	}

	#abortApprovedSpeech(connectionId: string): void {
		const approvedSpeech = this.#approvedSpeech.get(connectionId);
		if (!approvedSpeech) return;
		this.#approvedSpeech.delete(connectionId);
		this.#logDocsToolsAborted(approvedSpeech.metricContext);
	}

	#abortInputGuardrail(connectionId: string): void {
		const controller = this.#inputGuardrailControllers.get(connectionId);
		if (!controller) return;
		controller.abort();
		this.#inputGuardrailControllers.delete(connectionId);
	}

	#beginEphemeralSpeech(
		connection: Connection,
		metricContext: VoiceMetricContext,
		phase: VoiceEphemeralPhase,
		delayMs: number,
	): void {
		this.#teardownEphemeralSpeech(connection, true);
		const controller = new AbortController();
		const timer = setTimeout(() => {
			void this.#fireEphemeralSpeech(connection);
		}, delayMs);
		this.#ephemeralSpeech.set(connection.id, {
			timer,
			controller,
			armedAt: performance.now(),
			phase,
			metricContext,
			attemptCount: 0,
			metricEmitted: false,
			spoken: false,
		});
	}

	#fireEphemeralSpeech(connection: Connection): void {
		const state = this.#ephemeralSpeech.get(connection.id);
		if (!state || state.spoken || state.controller.signal.aborted) return;
		state.spoken = true;
		clearTimeout(state.timer);
		const phrase =
			state.phase === "recovery"
				? pickRecoveryPhrase(this.#ephemeralPhraseRotation)
				: pickFillerPhrase(this.#ephemeralPhraseRotation);

		const speak = async () => {
			try {
				const audio = await this.tts.synthesize(
					phrase,
					state.controller.signal,
					(attempt) => (state.attemptCount = attempt),
				);
				if (state.controller.signal.aborted) {
					this.#finishEphemeralSpeechMetric(state, "aborted", true);
					return;
				}
				if (!audio) {
					this.#finishEphemeralSpeechMetric(
						state,
						"failed",
						state.phase === "recovery",
					);
					return;
				}
				if (shouldAnnounceEphemeralSpeakingStatus(state.phase)) {
					this.#notify(connection, {
						type: "status",
						status: "speaking",
					});
				}
				connection.send(audio);
				if (state.phase === "recovery") {
					this.#notify(connection, {
						type: "status",
						status: "listening",
					});
				}
				this.#finishEphemeralSpeechMetric(
					state,
					"succeeded",
					state.phase === "recovery",
				);
			} catch (error) {
				if (state.controller.signal.aborted) {
					this.#finishEphemeralSpeechMetric(state, "aborted", true);
					return;
				}
				this.#finishEphemeralSpeechMetric(
					state,
					"failed",
					state.phase === "recovery",
				);
				logger
					.withTags({
						connectionId: connection.id,
						attemptCount: state.attemptCount,
						error: error instanceof Error ? error.message : String(error),
						stack: error instanceof Error ? error.stack : undefined,
					})
					.warn("voice ephemeral speech failed");
			} finally {
				if (this.#ephemeralSpeech.get(connection.id) === state) {
					this.#ephemeralSpeech.delete(connection.id);
				}
			}
		};
		void speak();
	}

	#teardownEphemeralSpeech(connection: Connection, flowStopped: boolean): void {
		const state = this.#ephemeralSpeech.get(connection.id);
		if (!state) return;
		clearTimeout(state.timer);
		state.controller.abort();
		this.#finishEphemeralSpeechMetric(
			state,
			"aborted",
			flowStopped || state.phase === "recovery",
		);
		this.#ephemeralSpeech.delete(connection.id);
	}

	#finishEphemeralSpeechMetric(
		state: VoiceEphemeralSpeechState,
		outcome: VoiceEphemeralOutcome,
		flowStopped: boolean,
	): void {
		if (state.metricEmitted) return;
		state.metricEmitted = true;
		logVoiceMetric(state.metricContext, {
			event: "voice_agent_ephemeral_speech",
			...voiceEphemeralLifecycle(outcome, flowStopped),
			phase: state.phase,
			attemptCount: state.attemptCount,
			durationMs: elapsedMsSince(state.armedAt),
		});
	}

	async #validatePrompt(
		transcript: string,
		connection: Connection,
		metricContext: VoiceMetricContext,
		signal?: AbortSignal,
	): Promise<string | null> {
		const startedAt = performance.now();
		const trimmed = transcript.trim();
		let outcome: VoiceGuardrailOutcome = "blocked";
		try {
			if (trimmed.length === 0) return null;
			if (trimmed.length > MAX_PROMPT_LENGTH) {
				this.#notify(connection, {
					type: "blocked",
					reason: `Message too long (max ${MAX_PROMPT_LENGTH} characters).`,
				});
				return null;
			}

			outcome = "error";
			try {
				const result = await checkPrompt(this.env.AI, trimmed, signal);
				outcome = result.safe ? "allowed" : "blocked";
				if (!result.safe) {
					logger
						.withTags({
							connectionId: connection.id,
							categories: result.categories,
						})
						.warn("voice prompt blocked by guardrails");
					this.#notify(connection, {
						type: "blocked",
						reason: result.message,
						categories: result.categories,
					});
					return null;
				}
			} catch (error) {
				if (signal?.aborted) {
					outcome = "aborted";
					return null;
				}
				logger
					.withTags({
						error: error instanceof Error ? error.message : String(error),
						stack: error instanceof Error ? error.stack : undefined,
						connectionId: connection.id,
						stage: "guardrail",
					})
					.error("voice guardrail check failed");
				this.#notify(connection, {
					type: "blocked",
					reason: "Safety check unavailable. Please try again.",
				});
				return null;
			}
			return trimmed;
		} finally {
			logVoiceMetric(metricContext, {
				event: "voice_agent_guardrail_check",
				...voiceGuardrailLifecycle(outcome, "input"),
				direction: "input",
				outcome,
				transcriptLength: trimmed.length,
				durationMs: elapsedMsSince(startedAt),
			});
		}
	}

	#discardLatestUserMessage(text: string): void {
		this.sql`
			DELETE FROM cf_voice_messages
			WHERE id = (
				SELECT id FROM cf_voice_messages
				WHERE role = 'user' AND text = ${text}
				ORDER BY id DESC LIMIT 1
			)
		`;
	}

	async #clearOwnedConversationHistory(): Promise<void> {
		if (this.#activeCallId !== null) return;
		try {
			if (this.#hasConversationHistory()) {
				this.sql`DELETE FROM cf_voice_messages`;
			}
		} catch (error) {
			logger
				.withTags({
					error: error instanceof Error ? error.message : String(error),
				})
				.error("voice conversation history cleanup failed");
			return;
		}
		await this.#cancelConversationCleanupSchedulesIfIdle();
	}

	#hasConversationHistory(): boolean {
		const [table] = this.sql<{ name: string }>`
			SELECT name FROM sqlite_master
			WHERE type = 'table' AND name = 'cf_voice_messages'
			LIMIT 1
		`;
		return table !== undefined;
	}

	#oldestConversationTimestamp(): number | null {
		if (!this.#hasConversationHistory()) return null;
		const [oldest] = this.sql<{ timestamp: number }>`
			SELECT timestamp FROM cf_voice_messages
			ORDER BY timestamp ASC LIMIT 1
		`;
		return oldest?.timestamp ?? null;
	}

	async #ensureConversationCleanupSchedule(deadlineMs: number): Promise<void> {
		return this.#queueRetentionScheduleOperation(() =>
			this.#reconcileConversationCleanupSchedule(deadlineMs),
		);
	}

	async #reconcileConversationCleanupSchedule(
		deadlineMs: number,
	): Promise<void> {
		const scheduledDeadlineMs =
			normalizeConversationCleanupScheduleTime(deadlineMs);
		const schedules = (await this.listSchedules()).filter(
			(schedule) => schedule.callback === "cleanupConversationHistory",
		);
		const matching = schedules.find(
			(schedule) =>
				typeof schedule.payload === "object" &&
				schedule.payload !== null &&
				"deadlineMs" in schedule.payload &&
				schedule.payload.deadlineMs === scheduledDeadlineMs,
		);
		if (!matching) {
			await this.schedule(
				new Date(scheduledDeadlineMs),
				"cleanupConversationHistory",
				{
					deadlineMs: scheduledDeadlineMs,
				} satisfies ConversationCleanupPayload,
				{ idempotent: true },
			);
		}

		const obsolete = schedules.filter(
			(schedule) => schedule.id !== matching?.id,
		);
		const cancellations = await Promise.allSettled(
			obsolete.map((schedule) => this.cancelSchedule(schedule.id)),
		);
		const failedCancellationCount = cancellations.filter(
			(result) => result.status === "rejected",
		).length;
		if (failedCancellationCount > 0) {
			logger
				.withTags({ failedCancellationCount })
				.warn(
					"obsolete voice conversation cleanup schedules could not be cancelled",
				);
		}
	}

	async #cancelConversationCleanupSchedulesIfIdle(): Promise<void> {
		return this.#queueRetentionScheduleOperation(async () => {
			const schedules = (await this.listSchedules()).filter(
				(schedule) => schedule.callback === "cleanupConversationHistory",
			);
			if (this.#activeCallId !== null) return;
			await Promise.all(
				schedules.map((schedule) => this.cancelSchedule(schedule.id)),
			);
		});
	}

	#queueRetentionScheduleOperation(
		operation: () => Promise<void>,
	): Promise<void> {
		const queued = this.#retentionScheduleQueue
			.catch(() => undefined)
			.then(operation);
		this.#retentionScheduleQueue = queued.catch(() => undefined);
		return queued;
	}

	#rejectConfiguration(connection: Connection, issue: string): void {
		this.#rejectedConfiguration.add(connection.id);
		logger
			.withTags({ connectionId: connection.id, issue })
			.warn("non-fixed voice configuration rejected");
		this.#notify(connection, {
			type: "voice_config_error",
			reason: "This template uses a fixed voice configuration.",
		});
	}

	async #prepareDocsTool(): Promise<void> {
		await this.#ensureDocsToolServer(CLOUDFLARE_DOCS_SERVER);
	}

	async #readyDocsTool(): Promise<void> {
		await this.#prepareDocsTool();
		await this.mcp.waitForConnections({
			timeout: DOCS_TOOLS_TURN_WAIT_MS,
		});
		const state = this.getMcpServers().servers[CLOUDFLARE_DOCS_SERVER.id];
		if (state?.state === "failed") {
			logger
				.withTags({
					serverId: CLOUDFLARE_DOCS_SERVER.id,
					error: state.error,
				})
				.error("voice docs tool server entered failed state");
			await this.#resetDocsToolServer(CLOUDFLARE_DOCS_SERVER);
		}
	}

	#ensureDocsToolServer(server: DocsToolServer): Promise<void> {
		if (this.#docsToolConnection) return this.#docsToolConnection;

		const connection = this.addMcpServer(server.name, server.url, {
			id: server.id,
		})
			.then((result) => {
				if (result.state !== "ready") {
					logger
						.withTags({
							serverId: server.id,
							state: result.state,
						})
						.warn("voice docs tool server connected without ready tools");
				}
			})
			.catch(async (error) => {
				logger
					.withTags({
						error: error instanceof Error ? error.message : String(error),
						stack: error instanceof Error ? error.stack : undefined,
						serverId: server.id,
						url: server.url,
					})
					.error("voice docs tool server connection failed");
				await this.#resetDocsToolServer(server, connection);
			});
		this.#docsToolConnection = connection;
		return connection;
	}

	async #resetDocsToolServer(
		server: DocsToolServer,
		expectedConnection?: Promise<void>,
	): Promise<void> {
		try {
			await this.removeMcpServer(server.id);
		} catch (error) {
			logger
				.withTags({
					error: error instanceof Error ? error.message : String(error),
					stack: error instanceof Error ? error.stack : undefined,
					serverId: server.id,
				})
				.error(
					"failed to reset voice docs tool server after connection failure",
				);
		} finally {
			if (
				expectedConnection === undefined ||
				this.#docsToolConnection === expectedConnection
			) {
				this.#docsToolConnection = null;
			}
		}
	}

	#logDocsToolsAborted(
		metricContext: VoiceMetricContext,
		durationMs = 0,
	): void {
		logVoiceMetric(metricContext, {
			event: "voice_agent_docs_tools_ready",
			...voiceToolsLifecycle("aborted", DOCS_TOOL_COUNT, 0),
			outcome: "aborted",
			requestedToolCount: DOCS_TOOL_COUNT,
			resolvedToolCount: 0,
			durationMs,
		});
	}

	#notify(connection: Connection, data: Record<string, unknown>): void {
		try {
			connection.send(JSON.stringify(data));
		} catch (error) {
			logger
				.withTags({
					connectionId: connection.id,
					error: error instanceof Error ? error.message : String(error),
					stack: error instanceof Error ? error.stack : undefined,
				})
				.error("failed to send voice custom message");
		}
	}
}
