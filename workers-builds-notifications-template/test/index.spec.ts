import { randomBytes } from "node:crypto";
import {
	createExecutionContext,
	createMessageBatch,
	env,
	getQueueResult,
	waitOnExecutionContext,
} from "cloudflare:test";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker, {
	type CloudflareEvent,
	getBuildStatus,
	getBuildFormatting,
	getWorkerName,
	calculateBuildDuration,
	isProductionBranch,
	truncateLogs,
	getBuildLogsUrl,
	formatEventForDisplay,
	buildSlackAttachments,
} from "../src/index";

// =============================================================================
// TEST HELPERS
// =============================================================================

function createMockEvent(
	overrides: Partial<CloudflareEvent> = {},
): CloudflareEvent {
	return {
		type: "cf.workersBuilds.worker.build.succeeded",
		source: {
			type: "workersBuilds.worker",
			workerName: "test-worker",
		},
		payload: {
			buildUuid: "build-12345678-90ab-cdef-1234-567890abcdef",
			status: "stopped",
			buildOutcome: "success",
			createdAt: "2025-05-01T02:48:57.132Z",
			stoppedAt: "2025-05-01T02:50:15.132Z",
			buildTriggerMetadata: {
				buildTriggerSource: "push_event",
				branch: "main",
				commitHash: "abc123def456",
				commitMessage: "Fix bug in authentication",
				author: "developer@example.com",
				buildCommand: "npm run build",
				deployCommand: "npm run deploy",
				rootDirectory: "/",
				repoName: "test-worker-repo",
				providerAccountName: "cloudflare",
				providerType: "github",
			},
		},
		metadata: {
			accountId: "test-account-id",
			eventSubscriptionId: "sub-123",
			eventSchemaVersion: 1,
			eventTimestamp: "2025-05-01T02:48:57.132Z",
		},
		...overrides,
	};
}

function createQueueMessage(
	event: CloudflareEvent,
): ServiceBindingQueueMessage<CloudflareEvent> {
	return {
		id: randomBytes(16).toString("hex"),
		timestamp: new Date(),
		attempts: 1,
		body: event,
	};
}

// =============================================================================
// UNIT TESTS: Helper Functions
// =============================================================================

describe("Helper Functions", () => {
	describe("getWorkerName", () => {
		it("should extract worker name from source", () => {
			const event = createMockEvent({
				source: { type: "workersBuilds.worker", workerName: "my-worker" },
			});
			expect(getWorkerName(event)).toBe("my-worker");
		});

		it("should fall back to repoName if workerName is missing", () => {
			const event = createMockEvent({
				source: { type: "workersBuilds.worker" },
			});
			expect(getWorkerName(event)).toBe("test-worker-repo");
		});

		it("should return undefined if both are missing", () => {
			const event = createMockEvent({
				source: { type: "workersBuilds.worker" },
				payload: {
					buildUuid: "build-123",
					status: "stopped",
					buildOutcome: "success",
					createdAt: "2025-05-01T02:48:57.132Z",
					buildTriggerMetadata: undefined,
				},
			});
			expect(getWorkerName(event)).toBeUndefined();
		});
	});

	describe("getBuildStatus", () => {
		it("should identify a successful build", () => {
			const event = createMockEvent({
				type: "cf.workersBuilds.worker.build.succeeded",
				payload: {
					buildUuid: "build-123",
					status: "stopped",
					buildOutcome: "success",
					createdAt: "2025-05-01T02:48:57.132Z",
				},
			});
			const status = getBuildStatus(event);
			expect(status.isSucceeded).toBe(true);
			expect(status.isFailed).toBe(false);
			expect(status.isCancelled).toBe(false);
			expect(status.isStarted).toBe(false);
		});

		it("should identify a failed build", () => {
			const event = createMockEvent({
				type: "cf.workersBuilds.worker.build.failed",
				payload: {
					buildUuid: "build-123",
					status: "stopped",
					buildOutcome: "fail",
					createdAt: "2025-05-01T02:48:57.132Z",
				},
			});
			const status = getBuildStatus(event);
			expect(status.isSucceeded).toBe(false);
			expect(status.isFailed).toBe(true);
			expect(status.isCancelled).toBe(false);
		});

		it("should identify a cancelled build (cancelled spelling)", () => {
			const event = createMockEvent({
				type: "cf.workersBuilds.worker.build.failed",
				payload: {
					buildUuid: "build-123",
					status: "stopped",
					buildOutcome: "cancelled",
					createdAt: "2025-05-01T02:48:57.132Z",
				},
			});
			const status = getBuildStatus(event);
			expect(status.isCancelled).toBe(true);
			expect(status.isFailed).toBe(false);
		});

		it("should identify a cancelled build (canceled spelling)", () => {
			const event = createMockEvent({
				type: "cf.workersBuilds.worker.build.failed",
				payload: {
					buildUuid: "build-123",
					status: "stopped",
					buildOutcome: "canceled",
					createdAt: "2025-05-01T02:48:57.132Z",
				},
			});
			const status = getBuildStatus(event);
			expect(status.isCancelled).toBe(true);
			expect(status.isFailed).toBe(false);
		});

		it("should identify a started build", () => {
			const event = createMockEvent({
				type: "cf.workersBuilds.worker.build.started",
				payload: {
					buildUuid: "build-123",
					status: "running",
					buildOutcome: null,
					createdAt: "2025-05-01T02:48:57.132Z",
				},
			});
			const status = getBuildStatus(event);
			expect(status.isStarted).toBe(true);
			expect(status.isSucceeded).toBe(false);
			expect(status.isFailed).toBe(false);
		});

		it("should identify a queued build as started", () => {
			const event = createMockEvent({
				type: "cf.workersBuilds.worker.build.queued",
				payload: {
					buildUuid: "build-123",
					status: "queued",
					buildOutcome: null,
					createdAt: "2025-05-01T02:48:57.132Z",
				},
			});
			const status = getBuildStatus(event);
			expect(status.isStarted).toBe(true);
		});
	});

	describe("getBuildFormatting", () => {
		it("should return green emoji and color for success", () => {
			const formatting = getBuildFormatting({
				isSucceeded: true,
				isFailed: false,
				isCancelled: false,
				isStarted: false,
			});
			expect(formatting.emoji).toBe("✅");
			expect(formatting.color).toBe("#36a64f");
		});

		it("should return orange emoji and color for cancelled", () => {
			const formatting = getBuildFormatting({
				isSucceeded: false,
				isFailed: false,
				isCancelled: true,
				isStarted: false,
			});
			expect(formatting.emoji).toBe("⚠️");
			expect(formatting.color).toBe("#ffa500");
		});

		it("should return red emoji and color for failed", () => {
			const formatting = getBuildFormatting({
				isSucceeded: false,
				isFailed: true,
				isCancelled: false,
				isStarted: false,
			});
			expect(formatting.emoji).toBe("❌");
			expect(formatting.color).toBe("#ff0000");
		});

		it("should return blue emoji and color for started", () => {
			const formatting = getBuildFormatting({
				isSucceeded: false,
				isFailed: false,
				isCancelled: false,
				isStarted: true,
			});
			expect(formatting.emoji).toBe("🚀");
			expect(formatting.color).toBe("#3AA3E3");
		});

		it("should return gray emoji and color for unknown status", () => {
			const formatting = getBuildFormatting({
				isSucceeded: false,
				isFailed: false,
				isCancelled: false,
				isStarted: false,
			});
			expect(formatting.emoji).toBe("📢");
			expect(formatting.color).toBe("#808080");
		});
	});

	describe("calculateBuildDuration", () => {
		it("should calculate duration in seconds", () => {
			const duration = calculateBuildDuration(
				"2025-05-01T02:48:57.132Z",
				"2025-05-01T02:50:15.132Z",
			);
			expect(duration).toBeCloseTo(78, 0);
		});

		it("should return null if stoppedAt is missing", () => {
			const duration = calculateBuildDuration("2025-05-01T02:48:57.132Z");
			expect(duration).toBeNull();
		});
	});

	describe("isProductionBranch", () => {
		it("should return true for main branch", () => {
			expect(isProductionBranch("main")).toBe(true);
		});

		it("should return true for master branch", () => {
			expect(isProductionBranch("master")).toBe(true);
		});

		it("should return false for feature branches", () => {
			expect(isProductionBranch("feature/new-feature")).toBe(false);
			expect(isProductionBranch("develop")).toBe(false);
			expect(isProductionBranch("staging")).toBe(false);
		});
	});

	describe("truncateLogs", () => {
		it("should not truncate short logs", () => {
			const logs = "Short log message";
			expect(truncateLogs(logs)).toBe(logs);
		});

		it("should truncate long logs and add prefix", () => {
			const longLogs = "x".repeat(35000);
			const truncated = truncateLogs(longLogs, 30000);
			expect(truncated.startsWith("[...truncated]\n")).toBe(true);
			expect(truncated.length).toBeLessThanOrEqual(30000 + 15); // 30000 + prefix length
		});

		it("should keep the end of logs (where errors usually are)", () => {
			const logs = "start..." + "x".repeat(35000) + "...end";
			const truncated = truncateLogs(logs, 30000);
			expect(truncated.endsWith("...end")).toBe(true);
		});
	});

	describe("getBuildLogsUrl", () => {
		it("should construct correct dashboard URL", () => {
			const url = getBuildLogsUrl("account-123", "my-worker", "build-456");
			expect(url).toBe(
				"https://dash.cloudflare.com/account-123/workers/services/view/my-worker/production/builds/build-456",
			);
		});
	});

	describe("formatEventForDisplay", () => {
		it("should format event with correct structure", () => {
			const event = createMockEvent();
			const formatted = formatEventForDisplay(event);

			expect(formatted).toHaveProperty("type");
			expect(formatted).toHaveProperty("source");
			expect(formatted).toHaveProperty("payload");
			expect(formatted).toHaveProperty("metadata");
		});
	});

	describe("buildSlackAttachments", () => {
		it("should build basic attachment without logs", () => {
			const event = createMockEvent();
			const attachments = buildSlackAttachments(event, "#36a64f");

			expect(attachments).toHaveLength(1);
			expect(attachments[0]).toHaveProperty("color", "#36a64f");
			expect(attachments[0]).toHaveProperty("text");
		});

		it("should include logs attachment when provided", () => {
			const event = createMockEvent();
			const attachments = buildSlackAttachments(
				event,
				"#ff0000",
				"Error: Build failed",
				false,
			);

			expect(attachments).toHaveLength(2);
			expect(attachments[1]).toHaveProperty("title", "📜 Build Logs");
			expect(attachments[1]).toHaveProperty("text", "Error: Build failed");
			expect(attachments[1]).toHaveProperty("color", "#ff0000");
		});

		it("should use orange color for cancelled build logs", () => {
			const event = createMockEvent();
			const attachments = buildSlackAttachments(
				event,
				"#ffa500",
				"Build cancelled",
				true,
			);

			expect(attachments[1]).toHaveProperty("color", "#ffa500");
		});
	});
});

// =============================================================================
// INTEGRATION TESTS: Queue Handler with vitest-pool-workers
// =============================================================================

describe("Queue Handler Integration", () => {
	// Store original fetch
	const originalFetch = globalThis.fetch;
	let fetchCalls: Array<{ url: string; init?: RequestInit }>;

	beforeEach(() => {
		fetchCalls = [];
	});

	afterEach(() => {
		// Restore original fetch
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	function mockFetch(
		handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
	) {
		globalThis.fetch = async (
			input: RequestInfo | URL,
			init?: RequestInit,
		): Promise<Response> => {
			const url = input.toString();
			fetchCalls.push({ url, init });
			return handler(url, init);
		};
	}

	it("should process a successful build event and send Slack notification", async () => {
		mockFetch((url) => {
			if (url.includes("/builds/builds/") && !url.includes("/logs")) {
				return new Response(
					JSON.stringify({
						result: { preview_url: "https://preview.example.com" },
					}),
				);
			}
			if (url.includes("hooks.slack.com")) {
				return new Response("ok");
			}
			return new Response("Not found", { status: 404 });
		});

		const event = createMockEvent({
			type: "cf.workersBuilds.worker.build.succeeded",
		});
		const messages = [createQueueMessage(event)];

		const batch = createMessageBatch("builds-event-subscriptions", messages);
		const ctx = createExecutionContext();

		await worker.queue(batch, env);
		const result = await getQueueResult(batch, ctx);

		expect(result.outcome).toBe("ok");
		expect(result.explicitAcks).toContain(messages[0].id);

		// Verify Slack was called
		const slackCall = fetchCalls.find((call) =>
			call.url.includes("hooks.slack.com"),
		);
		expect(slackCall).toBeDefined();
	});

	it("should process a failed build event with logs", async () => {
		mockFetch((url) => {
			if (url.includes("/logs")) {
				return new Response(
					JSON.stringify({
						result: {
							lines: [
								[1, "Building..."],
								[2, "Error: Module not found"],
							],
							truncated: false,
						},
					}),
				);
			}
			if (url.includes("hooks.slack.com")) {
				return new Response("ok");
			}
			return new Response("Not found", { status: 404 });
		});

		const event = createMockEvent({
			type: "cf.workersBuilds.worker.build.failed",
			payload: {
				buildUuid: "build-failed-123",
				status: "stopped",
				buildOutcome: "fail",
				createdAt: "2025-05-01T02:48:57.132Z",
				stoppedAt: "2025-05-01T02:50:15.132Z",
				buildTriggerMetadata: {
					buildTriggerSource: "push_event",
					branch: "feature/broken",
					commitHash: "abc123",
					commitMessage: "Broken build",
					author: "dev@example.com",
					buildCommand: "npm run build",
					deployCommand: "npm run deploy",
					rootDirectory: "/",
					repoName: "test-worker",
					providerAccountName: "cloudflare",
					providerType: "github",
				},
			},
		});
		const messages = [createQueueMessage(event)];

		const batch = createMessageBatch("builds-event-subscriptions", messages);
		const ctx = createExecutionContext();

		await worker.queue(batch, env);
		const result = await getQueueResult(batch, ctx);

		expect(result.outcome).toBe("ok");
		expect(result.explicitAcks).toContain(messages[0].id);

		// Verify logs API was called
		const logsCall = fetchCalls.find((call) => call.url.includes("/logs"));
		expect(logsCall).toBeDefined();
	});

	it("should process a cancelled build event", async () => {
		mockFetch((url) => {
			if (url.includes("/logs")) {
				return new Response(
					JSON.stringify({
						result: {
							lines: [[1, "Build cancelled by user"]],
							truncated: false,
						},
					}),
				);
			}
			if (url.includes("hooks.slack.com")) {
				return new Response("ok");
			}
			return new Response("Not found", { status: 404 });
		});

		const event = createMockEvent({
			type: "cf.workersBuilds.worker.build.failed",
			payload: {
				buildUuid: "build-cancelled-123",
				status: "stopped",
				buildOutcome: "cancelled",
				createdAt: "2025-05-01T02:48:57.132Z",
				stoppedAt: "2025-05-01T02:49:00.132Z",
			},
		});
		const messages = [createQueueMessage(event)];

		const batch = createMessageBatch("builds-event-subscriptions", messages);
		const ctx = createExecutionContext();

		await worker.queue(batch, env);
		const result = await getQueueResult(batch, ctx);

		expect(result.outcome).toBe("ok");
		expect(result.explicitAcks).toContain(messages[0].id);
	});

	it("should process a build started event", async () => {
		mockFetch((url) => {
			if (url.includes("hooks.slack.com")) {
				return new Response("ok");
			}
			return new Response("Not found", { status: 404 });
		});

		const event = createMockEvent({
			type: "cf.workersBuilds.worker.build.started",
			payload: {
				buildUuid: "build-started-123",
				status: "running",
				buildOutcome: null,
				createdAt: "2025-05-01T02:48:57.132Z",
			},
		});
		const messages = [createQueueMessage(event)];

		const batch = createMessageBatch("builds-event-subscriptions", messages);
		const ctx = createExecutionContext();

		await worker.queue(batch, env);
		const result = await getQueueResult(batch, ctx);

		expect(result.outcome).toBe("ok");
		expect(result.explicitAcks).toContain(messages[0].id);

		// Verify no logs API call for started events
		const logsCall = fetchCalls.find((call) => call.url.includes("/logs"));
		expect(logsCall).toBeUndefined();
	});

	it("should handle batch of multiple messages", async () => {
		mockFetch((url) => {
			if (url.includes("/builds/builds/") && !url.includes("/logs")) {
				return new Response(JSON.stringify({ result: {} }));
			}
			if (url.includes("/subdomain")) {
				return new Response(
					JSON.stringify({ result: { subdomain: "my-subdomain" } }),
				);
			}
			if (url.includes("hooks.slack.com")) {
				return new Response("ok");
			}
			return new Response("Not found", { status: 404 });
		});

		const events = [
			createMockEvent({ type: "cf.workersBuilds.worker.build.started" }),
			createMockEvent({ type: "cf.workersBuilds.worker.build.succeeded" }),
		];
		const messages = events.map(createQueueMessage);

		const batch = createMessageBatch("builds-event-subscriptions", messages);
		const ctx = createExecutionContext();

		await worker.queue(batch, env);
		const result = await getQueueResult(batch, ctx);

		expect(result.outcome).toBe("ok");
		expect(result.explicitAcks).toHaveLength(2);
		expect(result.explicitAcks).toContain(messages[0].id);
		expect(result.explicitAcks).toContain(messages[1].id);
	});

	it("should acknowledge message even when fetch fails", async () => {
		globalThis.fetch = async () => {
			throw new Error("Network error");
		};

		const event = createMockEvent();
		const messages = [createQueueMessage(event)];

		const batch = createMessageBatch("builds-event-subscriptions", messages);
		const ctx = createExecutionContext();

		// Should not throw
		await worker.queue(batch, env);
		const result = await getQueueResult(batch, ctx);

		// Message should still be acknowledged
		expect(result.explicitAcks).toContain(messages[0].id);
	});

	it("should fetch live worker URL for production builds without preview URL", async () => {
		mockFetch((url) => {
			if (url.includes("/builds/builds/") && !url.includes("/logs")) {
				return new Response(JSON.stringify({ result: {} }));
			}
			if (url.includes("/subdomain")) {
				return new Response(
					JSON.stringify({ result: { subdomain: "my-account" } }),
				);
			}
			if (url.includes("hooks.slack.com")) {
				return new Response("ok");
			}
			return new Response("Not found", { status: 404 });
		});

		const event = createMockEvent({
			type: "cf.workersBuilds.worker.build.succeeded",
			source: { type: "workersBuilds.worker", workerName: "production-worker" },
		});
		const messages = [createQueueMessage(event)];

		const batch = createMessageBatch("builds-event-subscriptions", messages);
		const ctx = createExecutionContext();

		await worker.queue(batch, env);
		const result = await getQueueResult(batch, ctx);

		expect(result.outcome).toBe("ok");

		// Verify subdomain API was called
		const subdomainCall = fetchCalls.find((call) =>
			call.url.includes("/subdomain"),
		);
		expect(subdomainCall).toBeDefined();
	});
});
