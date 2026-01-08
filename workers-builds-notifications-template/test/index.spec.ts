import { env, createMessageBatch } from "cloudflare:test";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker, { type CloudflareEvent } from "../src/index";

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
		id: crypto.randomUUID(),
		timestamp: new Date(),
		attempts: 1,
		body: event,
	};
}

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe("Workers Builds Notifications", () => {
	const originalFetch = globalThis.fetch;
	let fetchCalls: Array<{ url: string; init?: RequestInit }>;
	let slackPayloads: any[];

	beforeEach(() => {
		fetchCalls = [];
		slackPayloads = [];
	});

	afterEach(() => {
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

			// Capture Slack payloads for assertions
			if (url.includes("hooks.slack.com") && init?.body) {
				slackPayloads.push(JSON.parse(init.body as string));
			}

			return handler(url, init);
		};
	}

	// =========================================================================
	// SUCCESS EVENTS
	// =========================================================================

	describe("Successful Builds", () => {
		it("should send production deploy notification with live URL", async () => {
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
				payload: {
					buildUuid: "build-123",
					status: "stopped",
					buildOutcome: "success",
					createdAt: "2025-05-01T02:48:57.132Z",
					buildTriggerMetadata: {
						buildTriggerSource: "push_event",
						branch: "main",
						commitHash: "abc123def456",
						commitMessage: "Deploy to production",
						author: "dev@example.com",
						buildCommand: "npm run build",
						deployCommand: "npm run deploy",
						rootDirectory: "/",
						repoName: "my-worker",
						providerAccountName: "cloudflare",
						providerType: "github",
					},
				},
			});

			const messages = [createQueueMessage(event)];
			const batch = createMessageBatch("builds-event-subscriptions", messages);

			await worker.queue(batch, env);

			expect(slackPayloads).toHaveLength(1);
			const payload = slackPayloads[0];
			expect(payload.blocks).toBeDefined();
			expect(payload.blocks[0].text.text).toContain("Production Deploy");
			expect(payload.blocks[0].text.text).toContain("test-worker");
		});

		it("should send preview deploy notification for feature branch", async () => {
			mockFetch((url) => {
				if (url.includes("/builds/builds/") && !url.includes("/logs")) {
					return new Response(
						JSON.stringify({
							result: { preview_url: "https://preview-abc123.workers.dev" },
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
				payload: {
					buildUuid: "build-123",
					status: "stopped",
					buildOutcome: "success",
					createdAt: "2025-05-01T02:48:57.132Z",
					buildTriggerMetadata: {
						buildTriggerSource: "push_event",
						branch: "feature/new-feature",
						commitHash: "def456abc789",
						commitMessage: "Add new feature",
						author: "dev@example.com",
						buildCommand: "npm run build",
						deployCommand: "npm run deploy",
						rootDirectory: "/",
						repoName: "my-worker",
						providerAccountName: "cloudflare",
						providerType: "github",
					},
				},
			});

			const messages = [createQueueMessage(event)];
			const batch = createMessageBatch("builds-event-subscriptions", messages);

			await worker.queue(batch, env);

			expect(slackPayloads).toHaveLength(1);
			const payload = slackPayloads[0];
			expect(payload.blocks[0].text.text).toContain("Preview Deploy");
		});

		it("should include commit link for GitHub repos", async () => {
			mockFetch((url) => {
				if (url.includes("/builds/builds/") && !url.includes("/logs")) {
					return new Response(JSON.stringify({ result: {} }));
				}
				if (url.includes("/subdomain")) {
					return new Response(
						JSON.stringify({ result: { subdomain: "test" } }),
					);
				}
				if (url.includes("hooks.slack.com")) {
					return new Response("ok");
				}
				return new Response("Not found", { status: 404 });
			});

			const event = createMockEvent({
				type: "cf.workersBuilds.worker.build.succeeded",
				payload: {
					buildUuid: "build-123",
					status: "stopped",
					buildOutcome: "success",
					createdAt: "2025-05-01T02:48:57.132Z",
					buildTriggerMetadata: {
						buildTriggerSource: "push_event",
						branch: "main",
						commitHash: "abc123def456789",
						commitMessage: "Test commit",
						author: "dev@example.com",
						buildCommand: "npm run build",
						deployCommand: "npm run deploy",
						rootDirectory: "/",
						repoName: "my-repo",
						providerAccountName: "my-org",
						providerType: "github",
					},
				},
			});

			const messages = [createQueueMessage(event)];
			const batch = createMessageBatch("builds-event-subscriptions", messages);

			await worker.queue(batch, env);

			expect(slackPayloads).toHaveLength(1);
			const payload = slackPayloads[0];
			const contextBlock = payload.blocks.find(
				(b: any) => b.type === "context",
			);
			expect(contextBlock).toBeDefined();

			const commitElement = contextBlock.elements.find((e: any) =>
				e.text.includes("Commit"),
			);
			expect(commitElement.text).toContain("github.com");
			expect(commitElement.text).toContain("abc123d"); // truncated hash
		});

		it("should treat master branch as production", async () => {
			mockFetch((url) => {
				if (url.includes("/builds/builds/") && !url.includes("/logs")) {
					return new Response(JSON.stringify({ result: {} }));
				}
				if (url.includes("/subdomain")) {
					return new Response(
						JSON.stringify({ result: { subdomain: "test" } }),
					);
				}
				if (url.includes("hooks.slack.com")) {
					return new Response("ok");
				}
				return new Response("Not found", { status: 404 });
			});

			const event = createMockEvent({
				payload: {
					buildUuid: "build-123",
					status: "stopped",
					buildOutcome: "success",
					createdAt: "2025-05-01T02:48:57.132Z",
					buildTriggerMetadata: {
						buildTriggerSource: "push_event",
						branch: "master",
						commitHash: "abc123",
						commitMessage: "Test",
						author: "dev@example.com",
						buildCommand: "npm run build",
						deployCommand: "npm run deploy",
						rootDirectory: "/",
						repoName: "my-repo",
						providerAccountName: "org",
						providerType: "github",
					},
				},
			});

			const messages = [createQueueMessage(event)];
			const batch = createMessageBatch("builds-event-subscriptions", messages);

			await worker.queue(batch, env);

			expect(slackPayloads[0].blocks[0].text.text).toContain(
				"Production Deploy",
			);
		});
	});

	// =========================================================================
	// FAILED BUILDS
	// =========================================================================

	describe("Failed Builds", () => {
		it("should send failure notification with error message", async () => {
			mockFetch((url) => {
				if (url.includes("/logs")) {
					return new Response(
						JSON.stringify({
							result: {
								lines: [
									[1, "Installing dependencies..."],
									[2, "Building worker..."],
									[3, '✘ [ERROR] Could not resolve "missing-module"'],
									[4, "Build failed"],
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
					buildOutcome: "failure",
					createdAt: "2025-05-01T02:48:57.132Z",
					stoppedAt: "2025-05-01T02:49:30.132Z",
					buildTriggerMetadata: {
						buildTriggerSource: "push_event",
						branch: "feature/broken",
						commitHash: "broken123",
						commitMessage: "This will fail",
						author: "dev@example.com",
						buildCommand: "npm run build",
						deployCommand: "npm run deploy",
						rootDirectory: "/",
						repoName: "my-worker",
						providerAccountName: "cloudflare",
						providerType: "github",
					},
				},
			});

			const messages = [createQueueMessage(event)];
			const batch = createMessageBatch("builds-event-subscriptions", messages);

			await worker.queue(batch, env);

			expect(slackPayloads).toHaveLength(1);
			const payload = slackPayloads[0];
			expect(payload.blocks[0].text.text).toContain("Build Failed");

			// Should have error in code block
			const errorBlock = payload.blocks.find((b: any) =>
				b.text?.text?.includes("```"),
			);
			expect(errorBlock).toBeDefined();
			expect(errorBlock.text.text).toContain("ERROR");
		});

		it("should extract first error from logs, not last", async () => {
			mockFetch((url) => {
				if (url.includes("/logs")) {
					return new Response(
						JSON.stringify({
							result: {
								lines: [
									[1, "Starting build..."],
									[2, "✘ [ERROR] First error - this is the root cause"],
									[3, "✘ [ERROR] Second error - cascading failure"],
									[4, "✘ [ERROR] Third error - another cascade"],
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
					buildUuid: "build-123",
					status: "stopped",
					buildOutcome: "failure",
					createdAt: "2025-05-01T02:48:57.132Z",
				},
			});

			const messages = [createQueueMessage(event)];
			const batch = createMessageBatch("builds-event-subscriptions", messages);

			await worker.queue(batch, env);

			const errorBlock = slackPayloads[0].blocks.find((b: any) =>
				b.text?.text?.includes("```"),
			);
			expect(errorBlock.text.text).toContain("First error");
		});

		it("should include View Logs button with dashboard URL", async () => {
			mockFetch((url) => {
				if (url.includes("/logs")) {
					return new Response(
						JSON.stringify({
							result: { lines: [[1, "Error: Build failed"]], truncated: false },
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
					buildUuid: "build-uuid-123",
					status: "stopped",
					buildOutcome: "failure",
					createdAt: "2025-05-01T02:48:57.132Z",
				},
				metadata: {
					accountId: "account-xyz",
					eventSubscriptionId: "sub-123",
					eventSchemaVersion: 1,
					eventTimestamp: "2025-05-01T02:48:57.132Z",
				},
			});

			const messages = [createQueueMessage(event)];
			const batch = createMessageBatch("builds-event-subscriptions", messages);

			await worker.queue(batch, env);

			const payload = slackPayloads[0];
			expect(payload.blocks[0].accessory).toBeDefined();
			expect(payload.blocks[0].accessory.text.text).toBe("View Logs");
			expect(payload.blocks[0].accessory.url).toContain("dash.cloudflare.com");
			expect(payload.blocks[0].accessory.url).toContain("account-xyz");
		});
	});

	// =========================================================================
	// CANCELLED BUILDS
	// =========================================================================

	describe("Cancelled Builds", () => {
		it("should send cancellation notification (cancelled spelling)", async () => {
			mockFetch((url) => {
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
				},
			});

			const messages = [createQueueMessage(event)];
			const batch = createMessageBatch("builds-event-subscriptions", messages);

			await worker.queue(batch, env);

			expect(slackPayloads).toHaveLength(1);
			expect(slackPayloads[0].blocks[0].text.text).toContain("Build Cancelled");
		});

		it("should send cancellation notification (canceled spelling)", async () => {
			mockFetch((url) => {
				if (url.includes("hooks.slack.com")) {
					return new Response("ok");
				}
				return new Response("Not found", { status: 404 });
			});

			const event = createMockEvent({
				type: "cf.workersBuilds.worker.build.failed",
				payload: {
					buildUuid: "build-canceled-123",
					status: "stopped",
					buildOutcome: "canceled",
					createdAt: "2025-05-01T02:48:57.132Z",
				},
			});

			const messages = [createQueueMessage(event)];
			const batch = createMessageBatch("builds-event-subscriptions", messages);

			await worker.queue(batch, env);

			expect(slackPayloads).toHaveLength(1);
			expect(slackPayloads[0].blocks[0].text.text).toContain("Build Cancelled");
		});

		it("should not fetch logs for cancelled builds", async () => {
			mockFetch((url) => {
				if (url.includes("hooks.slack.com")) {
					return new Response("ok");
				}
				return new Response("Not found", { status: 404 });
			});

			const event = createMockEvent({
				type: "cf.workersBuilds.worker.build.failed",
				payload: {
					buildUuid: "build-123",
					status: "stopped",
					buildOutcome: "cancelled",
					createdAt: "2025-05-01T02:48:57.132Z",
				},
			});

			const messages = [createQueueMessage(event)];
			const batch = createMessageBatch("builds-event-subscriptions", messages);

			await worker.queue(batch, env);

			const logsCall = fetchCalls.find((call) => call.url.includes("/logs"));
			expect(logsCall).toBeUndefined();
		});
	});

	// =========================================================================
	// SKIPPED EVENTS
	// =========================================================================

	describe("Skipped Events", () => {
		it("should skip started events without sending notification", async () => {
			mockFetch((url) => {
				if (url.includes("hooks.slack.com")) {
					return new Response("ok");
				}
				return new Response("Not found", { status: 404 });
			});

			const event = createMockEvent({
				type: "cf.workersBuilds.worker.build.started",
				payload: {
					buildUuid: "build-123",
					status: "running",
					buildOutcome: null,
					createdAt: "2025-05-01T02:48:57.132Z",
				},
			});

			const messages = [createQueueMessage(event)];
			const batch = createMessageBatch("builds-event-subscriptions", messages);

			await worker.queue(batch, env);

			expect(slackPayloads).toHaveLength(0);
		});

		it("should skip queued events without sending notification", async () => {
			mockFetch((url) => {
				if (url.includes("hooks.slack.com")) {
					return new Response("ok");
				}
				return new Response("Not found", { status: 404 });
			});

			const event = createMockEvent({
				type: "cf.workersBuilds.worker.build.queued",
				payload: {
					buildUuid: "build-123",
					status: "queued",
					buildOutcome: null,
					createdAt: "2025-05-01T02:48:57.132Z",
				},
			});

			const messages = [createQueueMessage(event)];
			const batch = createMessageBatch("builds-event-subscriptions", messages);

			await worker.queue(batch, env);

			expect(slackPayloads).toHaveLength(0);
		});
	});

	// =========================================================================
	// ERROR HANDLING
	// =========================================================================

	describe("Error Handling", () => {
		it("should handle missing SLACK_WEBHOOK_URL gracefully", async () => {
			const event = createMockEvent();
			const messages = [createQueueMessage(event)];
			const batch = createMessageBatch("builds-event-subscriptions", messages);

			const envWithoutSlack = { ...env, SLACK_WEBHOOK_URL: "" };

			// Should not throw
			await worker.queue(batch, envWithoutSlack as typeof env);
		});

		it("should handle invalid event structure", async () => {
			mockFetch(() => new Response("ok"));

			const invalidEvent = { type: null, payload: null, metadata: null } as any;
			const messages = [createQueueMessage(invalidEvent)];
			const batch = createMessageBatch("builds-event-subscriptions", messages);

			// Should not throw
			await worker.queue(batch, env);
			expect(slackPayloads).toHaveLength(0);
		});

		it("should handle Slack API errors gracefully", async () => {
			mockFetch((url) => {
				if (url.includes("/builds/builds/")) {
					return new Response(JSON.stringify({ result: {} }));
				}
				if (url.includes("/subdomain")) {
					return new Response(
						JSON.stringify({ result: { subdomain: "test" } }),
					);
				}
				if (url.includes("hooks.slack.com")) {
					return new Response("invalid_token", { status: 401 });
				}
				return new Response("Not found", { status: 404 });
			});

			const event = createMockEvent();
			const messages = [createQueueMessage(event)];
			const batch = createMessageBatch("builds-event-subscriptions", messages);

			// Should not throw
			await worker.queue(batch, env);
		});

		it("should handle Cloudflare API errors gracefully", async () => {
			mockFetch((url) => {
				if (url.includes("api.cloudflare.com")) {
					throw new Error("Network error");
				}
				if (url.includes("hooks.slack.com")) {
					return new Response("ok");
				}
				return new Response("Not found", { status: 404 });
			});

			const event = createMockEvent();
			const messages = [createQueueMessage(event)];
			const batch = createMessageBatch("builds-event-subscriptions", messages);

			// Should not throw
			await worker.queue(batch, env);
			expect(slackPayloads).toHaveLength(1);
		});
	});

	// =========================================================================
	// BATCH PROCESSING
	// =========================================================================

	describe("Batch Processing", () => {
		it("should process multiple messages in a batch", async () => {
			mockFetch((url) => {
				if (url.includes("/builds/builds/") && !url.includes("/logs")) {
					return new Response(JSON.stringify({ result: {} }));
				}
				if (url.includes("/subdomain")) {
					return new Response(
						JSON.stringify({ result: { subdomain: "test" } }),
					);
				}
				if (url.includes("/logs")) {
					return new Response(
						JSON.stringify({
							result: { lines: [[1, "Error"]], truncated: false },
						}),
					);
				}
				if (url.includes("hooks.slack.com")) {
					return new Response("ok");
				}
				return new Response("Not found", { status: 404 });
			});

			const events = [
				createMockEvent({ type: "cf.workersBuilds.worker.build.succeeded" }),
				createMockEvent({
					type: "cf.workersBuilds.worker.build.failed",
					payload: {
						buildUuid: "build-456",
						status: "stopped",
						buildOutcome: "failure",
						createdAt: "2025-05-01T02:48:57.132Z",
					},
				}),
			];

			const messages = events.map(createQueueMessage);
			const batch = createMessageBatch("builds-event-subscriptions", messages);

			await worker.queue(batch, env);

			expect(slackPayloads).toHaveLength(2);
		});

		it("should skip started events but process others in same batch", async () => {
			mockFetch((url) => {
				if (url.includes("/builds/builds/") && !url.includes("/logs")) {
					return new Response(JSON.stringify({ result: {} }));
				}
				if (url.includes("/subdomain")) {
					return new Response(
						JSON.stringify({ result: { subdomain: "test" } }),
					);
				}
				if (url.includes("hooks.slack.com")) {
					return new Response("ok");
				}
				return new Response("Not found", { status: 404 });
			});

			const events = [
				createMockEvent({
					type: "cf.workersBuilds.worker.build.started",
					payload: {
						buildUuid: "build-1",
						status: "running",
						buildOutcome: null,
						createdAt: "2025-05-01T02:48:57.132Z",
					},
				}),
				createMockEvent({ type: "cf.workersBuilds.worker.build.succeeded" }),
				createMockEvent({
					type: "cf.workersBuilds.worker.build.queued",
					payload: {
						buildUuid: "build-3",
						status: "queued",
						buildOutcome: null,
						createdAt: "2025-05-01T02:48:57.132Z",
					},
				}),
			];

			const messages = events.map(createQueueMessage);
			const batch = createMessageBatch("builds-event-subscriptions", messages);

			await worker.queue(batch, env);

			// Only the succeeded event should trigger a notification
			expect(slackPayloads).toHaveLength(1);
			expect(slackPayloads[0].blocks[0].text.text).toContain(
				"Production Deploy",
			);
		});
	});

	// =========================================================================
	// METADATA HANDLING
	// =========================================================================

	describe("Metadata Handling", () => {
		it("should extract author name from email", async () => {
			mockFetch((url) => {
				if (url.includes("/builds/builds/") && !url.includes("/logs")) {
					return new Response(JSON.stringify({ result: {} }));
				}
				if (url.includes("/subdomain")) {
					return new Response(
						JSON.stringify({ result: { subdomain: "test" } }),
					);
				}
				if (url.includes("hooks.slack.com")) {
					return new Response("ok");
				}
				return new Response("Not found", { status: 404 });
			});

			const event = createMockEvent({
				payload: {
					buildUuid: "build-123",
					status: "stopped",
					buildOutcome: "success",
					createdAt: "2025-05-01T02:48:57.132Z",
					buildTriggerMetadata: {
						buildTriggerSource: "push_event",
						branch: "main",
						commitHash: "abc123",
						commitMessage: "Test",
						author: "john.doe@example.com",
						buildCommand: "npm run build",
						deployCommand: "npm run deploy",
						rootDirectory: "/",
						repoName: "my-repo",
						providerAccountName: "org",
						providerType: "github",
					},
				},
			});

			const messages = [createQueueMessage(event)];
			const batch = createMessageBatch("builds-event-subscriptions", messages);

			await worker.queue(batch, env);

			const contextBlock = slackPayloads[0].blocks.find(
				(b: any) => b.type === "context",
			);
			const authorElement = contextBlock.elements.find((e: any) =>
				e.text.includes("Author"),
			);
			expect(authorElement.text).toContain("john.doe");
			expect(authorElement.text).not.toContain("@example.com");
		});

		it("should handle GitLab commit URLs", async () => {
			mockFetch((url) => {
				if (url.includes("/builds/builds/") && !url.includes("/logs")) {
					return new Response(JSON.stringify({ result: {} }));
				}
				if (url.includes("/subdomain")) {
					return new Response(
						JSON.stringify({ result: { subdomain: "test" } }),
					);
				}
				if (url.includes("hooks.slack.com")) {
					return new Response("ok");
				}
				return new Response("Not found", { status: 404 });
			});

			const event = createMockEvent({
				payload: {
					buildUuid: "build-123",
					status: "stopped",
					buildOutcome: "success",
					createdAt: "2025-05-01T02:48:57.132Z",
					buildTriggerMetadata: {
						buildTriggerSource: "push_event",
						branch: "main",
						commitHash: "abc123def456",
						commitMessage: "Test",
						author: "dev@example.com",
						buildCommand: "npm run build",
						deployCommand: "npm run deploy",
						rootDirectory: "/",
						repoName: "my-repo",
						providerAccountName: "my-group",
						providerType: "gitlab",
					},
				},
			});

			const messages = [createQueueMessage(event)];
			const batch = createMessageBatch("builds-event-subscriptions", messages);

			await worker.queue(batch, env);

			const contextBlock = slackPayloads[0].blocks.find(
				(b: any) => b.type === "context",
			);
			const commitElement = contextBlock.elements.find((e: any) =>
				e.text.includes("Commit"),
			);
			expect(commitElement.text).toContain("gitlab.com");
		});

		it("should handle missing buildTriggerMetadata gracefully", async () => {
			mockFetch((url) => {
				if (url.includes("/builds/builds/") && !url.includes("/logs")) {
					return new Response(JSON.stringify({ result: {} }));
				}
				if (url.includes("/subdomain")) {
					return new Response(
						JSON.stringify({ result: { subdomain: "test" } }),
					);
				}
				if (url.includes("hooks.slack.com")) {
					return new Response("ok");
				}
				return new Response("Not found", { status: 404 });
			});

			const event = createMockEvent({
				payload: {
					buildUuid: "build-123",
					status: "stopped",
					buildOutcome: "success",
					createdAt: "2025-05-01T02:48:57.132Z",
					buildTriggerMetadata: undefined,
				},
			});

			const messages = [createQueueMessage(event)];
			const batch = createMessageBatch("builds-event-subscriptions", messages);

			// Should not throw
			await worker.queue(batch, env);
			expect(slackPayloads).toHaveLength(1);
		});

		it("should treat production branch as production deploy", async () => {
			mockFetch((url) => {
				if (url.includes("/builds/builds/") && !url.includes("/logs")) {
					return new Response(JSON.stringify({ result: {} }));
				}
				if (url.includes("/subdomain")) {
					return new Response(
						JSON.stringify({ result: { subdomain: "test" } }),
					);
				}
				if (url.includes("hooks.slack.com")) {
					return new Response("ok");
				}
				return new Response("Not found", { status: 404 });
			});

			const event = createMockEvent({
				payload: {
					buildUuid: "build-123",
					status: "stopped",
					buildOutcome: "success",
					createdAt: "2025-05-01T02:48:57.132Z",
					buildTriggerMetadata: {
						buildTriggerSource: "push_event",
						branch: "production",
						commitHash: "abc123",
						commitMessage: "Test",
						author: "dev@example.com",
						buildCommand: "npm run build",
						deployCommand: "npm run deploy",
						rootDirectory: "/",
						repoName: "my-repo",
						providerAccountName: "org",
						providerType: "github",
					},
				},
			});

			const messages = [createQueueMessage(event)];
			const batch = createMessageBatch("builds-event-subscriptions", messages);

			await worker.queue(batch, env);

			expect(slackPayloads[0].blocks[0].text.text).toContain(
				"Production Deploy",
			);
		});

		it("should treat prod branch as production deploy", async () => {
			mockFetch((url) => {
				if (url.includes("/builds/builds/") && !url.includes("/logs")) {
					return new Response(JSON.stringify({ result: {} }));
				}
				if (url.includes("/subdomain")) {
					return new Response(
						JSON.stringify({ result: { subdomain: "test" } }),
					);
				}
				if (url.includes("hooks.slack.com")) {
					return new Response("ok");
				}
				return new Response("Not found", { status: 404 });
			});

			const event = createMockEvent({
				payload: {
					buildUuid: "build-123",
					status: "stopped",
					buildOutcome: "success",
					createdAt: "2025-05-01T02:48:57.132Z",
					buildTriggerMetadata: {
						buildTriggerSource: "push_event",
						branch: "prod",
						commitHash: "abc123",
						commitMessage: "Test",
						author: "dev@example.com",
						buildCommand: "npm run build",
						deployCommand: "npm run deploy",
						rootDirectory: "/",
						repoName: "my-repo",
						providerAccountName: "org",
						providerType: "github",
					},
				},
			});

			const messages = [createQueueMessage(event)];
			const batch = createMessageBatch("builds-event-subscriptions", messages);

			await worker.queue(batch, env);

			expect(slackPayloads[0].blocks[0].text.text).toContain(
				"Production Deploy",
			);
		});
	});

	// =========================================================================
	// LOG PAGINATION
	// =========================================================================

	describe("Log Pagination", () => {
		it("should fetch all paginated logs for failed builds", async () => {
			let logCallCount = 0;

			mockFetch((url) => {
				if (url.includes("/logs")) {
					logCallCount++;
					if (logCallCount === 1) {
						// First page - truncated, has cursor
						return new Response(
							JSON.stringify({
								result: {
									lines: [[1, "Starting build..."]],
									truncated: true,
									cursor: "cursor-abc123",
								},
							}),
						);
					}
					// Second page - includes the actual error
					expect(url).toContain("cursor=cursor-abc123");
					return new Response(
						JSON.stringify({
							result: {
								lines: [[2, "✘ [ERROR] Module not found"]],
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
					buildUuid: "build-123",
					status: "stopped",
					buildOutcome: "failure",
					createdAt: "2025-05-01T02:48:57.132Z",
				},
			});

			const messages = [createQueueMessage(event)];
			const batch = createMessageBatch("builds-event-subscriptions", messages);

			await worker.queue(batch, env);

			// Should have made 2 log API calls
			expect(logCallCount).toBe(2);

			// Should include error from second page
			const errorBlock = slackPayloads[0].blocks.find((b: any) =>
				b.text?.text?.includes("```"),
			);
			expect(errorBlock.text.text).toContain("Module not found");
		});
	});

	// =========================================================================
	// FALLBACK HANDLING
	// =========================================================================

	describe("Fallback Handling", () => {
		it("should handle unknown event types with fallback message", async () => {
			mockFetch((url) => {
				if (url.includes("hooks.slack.com")) {
					return new Response("ok");
				}
				return new Response("Not found", { status: 404 });
			});

			// Event type that doesn't match succeeded, failed, started, or queued
			const event = createMockEvent({
				type: "cf.workersBuilds.worker.build.unknown_status",
				payload: {
					buildUuid: "build-123",
					status: "unknown",
					buildOutcome: null,
					createdAt: "2025-05-01T02:48:57.132Z",
				},
			});

			const messages = [createQueueMessage(event)];
			const batch = createMessageBatch("builds-event-subscriptions", messages);

			await worker.queue(batch, env);

			expect(slackPayloads).toHaveLength(1);
			expect(slackPayloads[0].blocks[0].text.text).toContain("📢");
			expect(slackPayloads[0].blocks[0].text.text).toContain("unknown_status");
		});

		it("should send notification without URLs when CLOUDFLARE_API_TOKEN is missing", async () => {
			mockFetch((url) => {
				if (url.includes("hooks.slack.com")) {
					return new Response("ok");
				}
				// Should not reach Cloudflare API
				if (url.includes("api.cloudflare.com")) {
					throw new Error("Should not call Cloudflare API without token");
				}
				return new Response("Not found", { status: 404 });
			});

			const event = createMockEvent();
			const messages = [createQueueMessage(event)];
			const batch = createMessageBatch("builds-event-subscriptions", messages);

			const envWithoutToken = { ...env, CLOUDFLARE_API_TOKEN: "" };
			await worker.queue(batch, envWithoutToken as typeof env);

			// Should still send notification
			expect(slackPayloads).toHaveLength(1);
			expect(slackPayloads[0].blocks[0].text.text).toContain(
				"Production Deploy",
			);

			// Should not have made any Cloudflare API calls
			const cfApiCalls = fetchCalls.filter((c) =>
				c.url.includes("api.cloudflare.com"),
			);
			expect(cfApiCalls).toHaveLength(0);
		});
	});
});
