import {
	elapsedMsSince,
	logVoiceMetric,
	voiceBindingFallbackLifecycle,
	type VoiceBindingResponseShape,
	type VoiceMetricContext,
} from "./metrics";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasItems(value: unknown): boolean {
	return Array.isArray(value) && value.length > 0;
}

function hasAbortedSignal(options: unknown): boolean {
	if (!isRecord(options) || !isRecord(options.signal)) return false;
	return options.signal.aborted === true;
}

function isAbortError(error: unknown): boolean {
	return isRecord(error) && error.name === "AbortError";
}

function responseShape(response: unknown): VoiceBindingResponseShape {
	if (response instanceof ReadableStream) return "stream";
	if (!isRecord(response)) return "unknown";
	if (hasItems(response.choices)) return "chat-completion";
	if (
		(typeof response.response === "string" && response.response.length > 0) ||
		hasItems(response.tool_calls)
	) {
		return "native";
	}
	if ("output_text" in response || "output" in response) {
		return "responses-api";
	}
	return Object.keys(response).length === 0 ? "empty" : "unknown";
}

export function createVoiceAIBinding(
	binding: Ai,
	metricContext: VoiceMetricContext,
	llmModel: string,
): Ai {
	return new Proxy(binding, {
		get(target, property) {
			if (property !== "run") return Reflect.get(target, property, target);

			return async (...args: unknown[]) => {
				const response: unknown = await Reflect.apply(target.run, target, args);
				const inputs = args[1];
				const initialResponseShape = responseShape(response);
				if (
					!isRecord(inputs) ||
					inputs.stream !== true ||
					initialResponseShape === "stream" ||
					initialResponseShape === "chat-completion" ||
					initialResponseShape === "native"
				) {
					return response;
				}

				const startedAt = performance.now();
				const retryArgs = [...args];
				retryArgs[1] = { ...inputs, stream: false };
				let retryResponse: unknown;
				try {
					retryResponse = await Reflect.apply(target.run, target, retryArgs);
				} catch (error) {
					const outcome =
						hasAbortedSignal(args[2]) || isAbortError(error)
							? "aborted"
							: "failed";
					logVoiceMetric(metricContext, {
						event: "voice_agent_llm_binding_fallback",
						...voiceBindingFallbackLifecycle(outcome),
						outcome,
						llmModel,
						initialResponseShape,
						retryResponseShape: "error",
						durationMs: elapsedMsSince(startedAt),
					});
					throw error;
				}
				logVoiceMetric(metricContext, {
					event: "voice_agent_llm_binding_fallback",
					...voiceBindingFallbackLifecycle("succeeded"),
					outcome: "succeeded",
					llmModel,
					initialResponseShape,
					retryResponseShape: responseShape(retryResponse),
					durationMs: elapsedMsSince(startedAt),
				});
				return retryResponse;
			};
		},
	});
}
