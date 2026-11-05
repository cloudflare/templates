import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createModelBudgetFetch } from "./model-budget.ts";
import type { AgentelTurnMeter, AgentelTurnSnapshot } from "./info-budget.ts";

export const CHAT_LIMITS = {
  modelRequests: 6,
  outputTokens: 1536,
  durationMs: 180000,
  steps: 6
} as const;

export type ChatBudgetReceipt = {
  schemaVersion: "chat-budget.v2";
  turnId: string;
  terminal: "completed" | "error" | "aborted";
  stage: "connection" | "setup" | "stream";
  abortSource: "NONE" | "PARENT_ABORT" | "DEADLINE" | "UNKNOWN";
  modelRequestAttempts: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  agentel: AgentelTurnSnapshot;
};

/** One terminal observation per turn, including pre-stream setup failures. */
export function createChatBudgetRecorder(
  turnId: string,
  deadline: ReturnType<typeof chatDeadline>,
  meter: AgentelTurnMeter,
  modelAttempts: () => number,
  persist: (receipt: ChatBudgetReceipt) => void
) {
  let recorded = false;
  let stage: ChatBudgetReceipt["stage"] = "connection";
  const finish = (
    terminal: ChatBudgetReceipt["terminal"],
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    }
  ) => {
    if (recorded) return false;
    recorded = true;
    deadline.signal.removeEventListener("abort", onSignalAbort);
    const source = deadline.abortSource();
    if (deadline.signal.aborted) terminal = "aborted";
    try {
      persist({
        schemaVersion: "chat-budget.v2",
        turnId,
        terminal,
        stage,
        abortSource:
          terminal === "aborted" && source === "NONE" ? "UNKNOWN" : source,
        modelRequestAttempts: modelAttempts(),
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
        totalTokens: usage?.totalTokens ?? null,
        agentel: meter.snapshot()
      });
      return true;
    } finally {
      deadline.dispose();
      // An AI SDK error notification need not close its stream. Stop further
      // provider/tool work without misclassifying an internal failure as an
      // operator cancellation or timeout. Capture the receipt before doing so.
      if (terminal === "error") deadline.stopAfterFailure();
    }
  };
  // The hosting SDK may cancel the UI response reader before AI SDK pull()
  // observes abort. Record directly from our signal, without depending on that
  // consumer continuing to drain the stream. Late callbacks cannot overwrite it.
  const onSignalAbort = () => {
    finish("aborted");
  };
  deadline.signal.addEventListener("abort", onSignalAbort, { once: true });
  if (deadline.signal.aborted) onSignalAbort();
  return {
    setStage(value: ChatBudgetReceipt["stage"]) {
      stage = value;
    },
    finish
  };
}

export type ChatModelBindings = {
  MODEL_API_PROTOCOL?: string;
  MODEL_API_BASE_URL: string;
  MODEL_API_KEY: string;
  MODEL_NAME: string;
  AGENTEL_READONLY_CHAT?: string;
};

export function readonlyChat(env: ChatModelBindings): boolean {
  if (env.AGENTEL_READONLY_CHAT === undefined) return false;
  if (!/^(true|false)$/.test(env.AGENTEL_READONLY_CHAT))
    throw new Error("AGENTEL_READONLY_CHAT must be true or false.");
  return env.AGENTEL_READONLY_CHAT === "true";
}

/** A fresh budget is created for each turn; SDK retries are separately disabled. */
export function boundedChatModel(
  env: ChatModelBindings,
  signal: AbortSignal,
  outbound: typeof fetch = fetch,
  transformResponse?: (response: Response) => Promise<Response>
) {
  const protocol = env.MODEL_API_PROTOCOL ?? "openai-compatible";
  if (protocol !== "openai-compatible" && protocol !== "anthropic-messages")
    throw new Error("Unsupported MODEL_API_PROTOCOL.");
  const baseURL = env.MODEL_API_BASE_URL.replace(/\/$/, "");
  const endpoint = `${baseURL}/${protocol === "anthropic-messages" ? "messages" : "chat/completions"}`;
  const transport = createModelBudgetFetch(
    endpoint,
    {
      maxRequests: CHAT_LIMITS.modelRequests,
      maxOutputTokens: CHAT_LIMITS.outputTokens,
      signal
    },
    outbound
  );
  if (!env.MODEL_API_KEY?.trim() || !env.MODEL_NAME?.trim())
    throw new Error("Configure a model key and model name.");
  const model =
    protocol === "anthropic-messages"
      ? createAnthropic({
          apiKey: env.MODEL_API_KEY,
          baseURL,
          fetch: transport
        })(env.MODEL_NAME)
      : createOpenAI({
          name: "openai-compatible",
          apiKey: env.MODEL_API_KEY,
          baseURL,
          // The resource/credential guard must consume raw provider bytes
          // before any line-buffering compatibility transformation.
          fetch: transformResponse
            ? async (input, init) =>
                transformResponse(await transport(input, init))
            : transport
        }).chat(env.MODEL_NAME);
  return {
    model,
    transport,
    maxRetries: 0 as const,
    maxOutputTokens: CHAT_LIMITS.outputTokens,
    // MiniMax M3 supports the Anthropic disabled-thinking shape. This is not
    // evidence of hosted compatibility; the actual route still needs acceptance.
    providerOptions:
      protocol === "anthropic-messages"
        ? { anthropic: { thinking: { type: "disabled" } } }
        : undefined
  };
}

export function chatDeadline(parent?: AbortSignal) {
  const controller = new AbortController();
  let source: "NONE" | "PARENT_ABORT" | "DEADLINE" = "NONE";
  let disposed = false;
  const abort = (cause: "PARENT_ABORT" | "DEADLINE") => {
    if (disposed || source !== "NONE") return;
    source = cause;
    // Never retain or expose an arbitrary parent signal reason.
    controller.abort();
  };
  const parentAbort = () => abort("PARENT_ABORT");
  if (parent?.aborted) parentAbort();
  else parent?.addEventListener("abort", parentAbort, { once: true });
  const timer = setTimeout(() => abort("DEADLINE"), CHAT_LIMITS.durationMs);
  return {
    signal: controller.signal,
    abortSource: () => source,
    stopAfterFailure: () => controller.abort(),
    dispose: () => {
      disposed = true;
      clearTimeout(timer);
      parent?.removeEventListener("abort", parentAbort);
    }
  };
}
