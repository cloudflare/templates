import type { ToolExecutionOptions, ToolSet } from "ai";

export const TOOL_RESULT_MAX_CHARS = 2_500;
export const CLOUDFLARE_DOCS_ATTEMPT_TIMEOUT_MS = 6_000;
export const CLOUDFLARE_DOCS_UNAVAILABLE_RESULT =
	"Cloudflare Docs search is unavailable. The official documentation could not be checked. Please retry your question.";
export const DOCS_TOOLS_TURN_WAIT_MS = 400;
export const DOCS_TOOL_COUNT = 1;

const DOCS_TOOLS_MAX_STEPS = 10;
const CLOUDFLARE_DOCS_MAX_ATTEMPTS = 2;
const CLOUDFLARE_DOCS_TIMEOUT = Symbol("cloudflare-docs-timeout");

export interface DocsToolServer {
	id: "cloudflare-docs";
	name: "Cloudflare Docs";
	url: "https://docs.mcp.cloudflare.com/mcp";
}

interface DocsToolSource {
	getAITools(filter: { serverId: string; state: "ready" }): ToolSet;
}

export interface DocsToolRuntime {
	tools: ToolSet;
	promptRules: readonly string[];
	maxSteps: number;
}

export interface CloudflareDocsAttemptEvent {
	attempt: number;
	outcome: "succeeded" | "timeout" | "error" | "aborted";
	terminal: boolean;
	durationMs: number;
}

interface ResolveDocsToolsOptions {
	onCloudflareDocsAttempt?: (event: CloudflareDocsAttemptEvent) => void;
}

export const CLOUDFLARE_DOCS_SERVER = {
	id: "cloudflare-docs",
	name: "Cloudflare Docs",
	url: "https://docs.mcp.cloudflare.com/mcp",
} as const satisfies DocsToolServer;

const DOCS_TOOL_NAME = "search_cloudflare_documentation";
const DOCS_TOOL_KEY = "tool_cloudflaredocs_search_cloudflare_documentation";

const CONNECTED_DOCS_PROMPT_RULES = [
	"CONNECTED TOOL RULES:",
	"Use Cloudflare Docs search for questions about Cloudflare products, APIs, configuration, limits, pricing, or documentation.",
	"For greetings, small talk, and topics unrelated to Cloudflare, answer directly without calling the tool.",
	"Ground Cloudflare answers in returned documentation.",
] as const;

const UNAVAILABLE_DOCS_PROMPT_RULES = [
	"UNAVAILABLE CLOUDFLARE DOCS RULES:",
	"For Cloudflare questions, say that the official Cloudflare documentation could not be checked and ask the user to retry. Do not answer from memory.",
	"For greetings, small talk, and topics unrelated to Cloudflare, answer directly.",
] as const;

type ToolExecutor = (
	input: unknown,
	options: ToolExecutionOptions<unknown>,
) => unknown | PromiseLike<unknown> | AsyncIterable<unknown>;

function truncateToolResult(result: unknown): unknown {
	try {
		const text = typeof result === "string" ? result : JSON.stringify(result);
		if (text.length <= TOOL_RESULT_MAX_CHARS) return result;
		return `${text.slice(0, TOOL_RESULT_MAX_CHARS)}...`;
	} catch {
		return "Tool result unavailable.";
	}
}

function abortReason(signal: AbortSignal): unknown {
	return (
		signal.reason ??
		new DOMException("The tool execution was aborted.", "AbortError")
	);
}

function isAbortException(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"name" in error &&
		error.name === "AbortError"
	);
}

async function executeCloudflareDocsAttempt(
	execute: ToolExecutor,
	input: unknown,
	options: ToolExecutionOptions<unknown>,
): Promise<unknown> {
	const callerSignal = options.abortSignal;
	if (callerSignal?.aborted) throw abortReason(callerSignal);

	const attemptController = new AbortController();
	let timedOut = false;
	let timeout: ReturnType<typeof setTimeout> | undefined;
	let onCallerAbort: (() => void) | undefined;

	const deadline = new Promise<never>((_, reject) => {
		timeout = setTimeout(() => {
			timedOut = true;
			attemptController.abort(
				new DOMException("Cloudflare Docs timed out.", "TimeoutError"),
			);
			reject(CLOUDFLARE_DOCS_TIMEOUT);
		}, CLOUDFLARE_DOCS_ATTEMPT_TIMEOUT_MS);
	});
	const callerAbort = new Promise<never>((_, reject) => {
		if (!callerSignal) return;
		onCallerAbort = () => {
			const reason = abortReason(callerSignal);
			attemptController.abort(reason);
			reject(reason);
		};
		callerSignal.addEventListener("abort", onCallerAbort, { once: true });
	});

	try {
		const execution = Promise.resolve().then(() =>
			execute(input, {
				...options,
				abortSignal: attemptController.signal,
			}),
		);
		return await Promise.race([execution, deadline, callerAbort]);
	} catch (error) {
		if (callerSignal?.aborted) throw abortReason(callerSignal);
		if (timedOut) throw CLOUDFLARE_DOCS_TIMEOUT;
		throw error;
	} finally {
		if (timeout !== undefined) clearTimeout(timeout);
		if (callerSignal && onCallerAbort) {
			callerSignal.removeEventListener("abort", onCallerAbort);
		}
	}
}

function limitDocsResult(
	tool: ToolSet[string],
	onAttempt?: (event: CloudflareDocsAttemptEvent) => void,
): ToolSet[string] {
	const execute = tool.execute;
	if (typeof execute !== "function") return tool;

	return {
		...tool,
		execute: async (input, options) => {
			for (
				let attempt = 0;
				attempt < CLOUDFLARE_DOCS_MAX_ATTEMPTS;
				attempt += 1
			) {
				const startedAt = performance.now();
				try {
					const result = truncateToolResult(
						await executeCloudflareDocsAttempt(execute, input, options),
					);
					onAttempt?.({
						attempt: attempt + 1,
						outcome: "succeeded",
						terminal: true,
						durationMs: Math.round(performance.now() - startedAt),
					});
					return result;
				} catch (error) {
					const aborted =
						options.abortSignal?.aborted || isAbortException(error);
					const terminal =
						aborted || attempt === CLOUDFLARE_DOCS_MAX_ATTEMPTS - 1;
					onAttempt?.({
						attempt: attempt + 1,
						outcome: aborted
							? "aborted"
							: error === CLOUDFLARE_DOCS_TIMEOUT
								? "timeout"
								: "error",
						terminal,
						durationMs: Math.round(performance.now() - startedAt),
					});
					if (aborted) throw error;
					if (terminal) return CLOUDFLARE_DOCS_UNAVAILABLE_RESULT;
				}
			}
			return CLOUDFLARE_DOCS_UNAVAILABLE_RESULT;
		},
	};
}

export function resolveDocsTools(
	source: DocsToolSource,
	options: ResolveDocsToolsOptions = {},
): DocsToolRuntime {
	let availableTools: ToolSet;
	try {
		availableTools = source.getAITools({
			serverId: CLOUDFLARE_DOCS_SERVER.id,
			state: "ready",
		});
	} catch {
		return {
			tools: {},
			promptRules: UNAVAILABLE_DOCS_PROMPT_RULES,
			maxSteps: DOCS_TOOLS_MAX_STEPS,
		};
	}

	const tool = availableTools[DOCS_TOOL_KEY];
	if (!tool) {
		return {
			tools: {},
			promptRules: UNAVAILABLE_DOCS_PROMPT_RULES,
			maxSteps: DOCS_TOOLS_MAX_STEPS,
		};
	}

	return {
		tools: {
			[DOCS_TOOL_KEY]: limitDocsResult(tool, options.onCloudflareDocsAttempt),
		},
		promptRules: CONNECTED_DOCS_PROMPT_RULES,
		maxSteps: DOCS_TOOLS_MAX_STEPS,
	};
}

export type DocsToolsWaitResult = "ready" | "timeout" | "aborted" | "error";

export function waitForDocsTools(
	ready: Promise<unknown>,
	timeoutMs: number,
	signal: AbortSignal,
): Promise<DocsToolsWaitResult> {
	if (signal.aborted) return Promise.resolve("aborted");

	return new Promise((resolve) => {
		let settled = false;
		const finish = (result: DocsToolsWaitResult) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			signal.removeEventListener("abort", onAbort);
			resolve(result);
		};
		const timer = setTimeout(() => finish("timeout"), timeoutMs);
		const onAbort = () => finish("aborted");
		signal.addEventListener("abort", onAbort, { once: true });
		ready.then(
			() => finish("ready"),
			() => finish("error"),
		);
	});
}

export const CLOUDFLARE_DOCS_TOOL_NAME = DOCS_TOOL_NAME;
export const CLOUDFLARE_DOCS_TOOL_KEY = DOCS_TOOL_KEY;
