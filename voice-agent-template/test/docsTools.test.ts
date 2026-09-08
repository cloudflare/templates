import { tool, type ToolExecutionOptions } from "ai";
import { z } from "zod";
import {
	CLOUDFLARE_DOCS_ATTEMPT_TIMEOUT_MS,
	CLOUDFLARE_DOCS_TOOL_KEY,
	CLOUDFLARE_DOCS_UNAVAILABLE_RESULT,
	TOOL_RESULT_MAX_CHARS,
	resolveDocsTools,
	waitForDocsTools,
	type CloudflareDocsAttemptEvent,
	type DocsToolRuntime,
} from "../src/voice/docsTools";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function runtime(
	execute: (
		options: ToolExecutionOptions<unknown>,
	) => unknown | PromiseLike<unknown>,
	onAttempt?: (event: CloudflareDocsAttemptEvent) => void,
): DocsToolRuntime {
	return resolveDocsTools(
		{
			getAITools: () => ({
				[CLOUDFLARE_DOCS_TOOL_KEY]: tool({
					description: "Search docs",
					inputSchema: z.object({}),
					execute: (_input, options) => execute(options),
				}),
				tool_cloudflaredocs_not_allowed: tool({
					inputSchema: z.object({}),
					execute: async () => "not allowed",
				}),
			}),
		},
		{ onCloudflareDocsAttempt: onAttempt },
	);
}

function executeDocsTool(
	docsRuntime: DocsToolRuntime,
	signal?: AbortSignal,
): Promise<unknown> {
	const execute = docsRuntime.tools[CLOUDFLARE_DOCS_TOOL_KEY]?.execute;
	if (typeof execute !== "function") throw new Error("Docs tool missing");
	return Promise.resolve(
		execute(
			{},
			{
				toolCallId: "docs-call",
				messages: [],
				context: undefined,
				abortSignal: signal,
			},
		),
	);
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("Cloudflare Docs MCP tool", () => {
	it("uses a Zod version that can convert MCP JSON schemas", () => {
		expect(typeof z.fromJSONSchema).toBe("function");
	});

	it("exposes only the exact read-only Docs search tool", () => {
		const docsRuntime = runtime(() => "result");
		expect(Object.keys(docsRuntime.tools)).toEqual([CLOUDFLARE_DOCS_TOOL_KEY]);
		expect(docsRuntime.promptRules.join(" ")).toContain(
			"Ground Cloudflare answers",
		);
	});

	it("returns the first successful result without retrying", async () => {
		const execute = vi.fn(() => "official result");
		await expect(executeDocsTool(runtime(execute))).resolves.toBe(
			"official result",
		);
		expect(execute).toHaveBeenCalledTimes(1);
	});

	it("retries one exception and returns the second result", async () => {
		const execute = vi
			.fn()
			.mockRejectedValueOnce(new Error("temporary"))
			.mockResolvedValueOnce("official result");
		await expect(executeDocsTool(runtime(execute))).resolves.toBe(
			"official result",
		);
		expect(execute).toHaveBeenCalledTimes(2);
	});

	it("returns the grounded unavailable result after two failures", async () => {
		const execute = vi.fn(async () => {
			throw new Error("unavailable");
		});
		await expect(executeDocsTool(runtime(execute))).resolves.toBe(
			CLOUDFLARE_DOCS_UNAVAILABLE_RESULT,
		);
		expect(execute).toHaveBeenCalledTimes(2);
	});

	it("bounds tool output", async () => {
		const oversized = "x".repeat(TOOL_RESULT_MAX_CHARS + 100);
		const result = await executeDocsTool(runtime(() => oversized));
		expect(String(result)).toHaveLength(TOOL_RESULT_MAX_CHARS + 3);
		expect(String(result)).toMatch(/\.\.\.$/);
	});

	it("times out each attempt and degrades after the second", async () => {
		const events: CloudflareDocsAttemptEvent[] = [];
		const pending = () => new Promise<never>(() => undefined);
		const result = executeDocsTool(
			runtime(pending, (event) => events.push(event)),
		);

		await vi.advanceTimersByTimeAsync(CLOUDFLARE_DOCS_ATTEMPT_TIMEOUT_MS * 2);
		await expect(result).resolves.toBe(CLOUDFLARE_DOCS_UNAVAILABLE_RESULT);
		expect(events.map(({ outcome }) => outcome)).toEqual([
			"timeout",
			"timeout",
		]);
	});

	it("reports readiness timeout and cancellation", async () => {
		const pending = new Promise<void>(() => undefined);
		const timeout = waitForDocsTools(pending, 50, new AbortController().signal);
		await vi.advanceTimersByTimeAsync(50);
		await expect(timeout).resolves.toBe("timeout");

		const controller = new AbortController();
		const aborted = waitForDocsTools(pending, 50, controller.signal);
		controller.abort();
		await expect(aborted).resolves.toBe("aborted");
	});
});
