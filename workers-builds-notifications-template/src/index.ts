/**
 * Cloudflare Workers Builds → Slack Notifications
 *
 * This worker consumes build events from a Cloudflare Queue and sends
 * notifications to Slack with:
 * - Preview/Live URLs for successful builds
 * - Full build logs for failed/cancelled builds
 *
 * @see https://developers.cloudflare.com/workers/ci-cd/builds
 * @see https://developers.cloudflare.com/queues/
 * @see https://developers.cloudflare.com/queues/event-subscriptions/
 */

import type {
	SectionBlock,
	ContextBlock,
	KnownBlock,
	MrkdwnElement,
	Button,
} from "@slack/types";

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface Env {
	SLACK_WEBHOOK_URL: string;
	CLOUDFLARE_API_TOKEN: string;
}

export interface CloudflareEvent {
	type: string;
	source: {
		type: string;
		workerName?: string;
	};
	payload: {
		buildUuid: string;
		status: string;
		buildOutcome: "success" | "failure" | "canceled" | "cancelled" | null;
		createdAt: string;
		initializingAt?: string;
		runningAt?: string;
		stoppedAt?: string;
		buildTriggerMetadata?: {
			buildTriggerSource: string;
			branch: string;
			commitHash: string;
			commitMessage: string;
			author: string;
			buildCommand: string;
			deployCommand: string;
			rootDirectory: string;
			repoName: string;
			providerAccountName: string;
			providerType: string;
		};
	};
	metadata: {
		accountId: string;
		eventSubscriptionId: string;
		eventSchemaVersion: number;
		eventTimestamp: string;
	};
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export function getCommitUrl(event: CloudflareEvent): string | null {
	const meta = event.payload?.buildTriggerMetadata;
	if (!meta?.repoName || !meta?.commitHash || !meta?.providerAccountName)
		return null;

	if (meta.providerType === "github") {
		return `https://github.com/${meta.providerAccountName}/${meta.repoName}/commit/${meta.commitHash}`;
	}
	if (meta.providerType === "gitlab") {
		return `https://gitlab.com/${meta.providerAccountName}/${meta.repoName}/-/commit/${meta.commitHash}`;
	}
	return null;
}

export function isProductionBranch(branch: string | undefined): boolean {
	if (!branch) return true;
	return ["main", "master", "production", "prod"].includes(
		branch.toLowerCase(),
	);
}

export function extractAuthorName(author: string | undefined): string | null {
	if (!author) return null;
	if (author.includes("@")) {
		const name = author.split("@")[0];
		return name || author; // Fallback to full author if split yields empty string
	}
	return author;
}

// Build status helper to avoid duplication
export interface BuildStatus {
	isSucceeded: boolean;
	isFailed: boolean;
	isCancelled: boolean;
}

export function getBuildStatus(event: CloudflareEvent): BuildStatus {
	const buildOutcome = event.payload?.buildOutcome;
	const isCancelled =
		buildOutcome === "canceled" ||
		buildOutcome === "cancelled" ||
		event.type?.includes("canceled") ||
		event.type?.includes("cancelled");
	const isFailed = event.type?.includes("failed") && !isCancelled;
	const isSucceeded = event.type?.includes("succeeded");

	return { isSucceeded, isFailed, isCancelled };
}

export function extractBuildError(logs: string[]): string {
	if (!logs || logs.length === 0) {
		return "No logs available";
	}

	// Lines to ignore - these are build metadata, not errors
	const ignorePatterns = [
		/^Total Upload:/i,
		/^Total Size:/i,
		/\/\s*gzip:/i,
		/^\d+\.\d+\s*(KiB|MiB|B)/i,
		/^Uploaded/i,
		/^Published/i,
		/^Worker Startup Time:/i,
		/^🌀/,
	];

	// Primary error patterns (most specific first)
	const errorPatterns = [
		/^✘\s*\[ERROR\]/i, // ✘ [ERROR] ...
		/^\[ERROR\]/i, // [ERROR] ...
		/^ERROR:/i, // ERROR: ...
		/^Error:/, // Error: ...
		/^❌/, // ❌ ...
	];

	// Look for the FIRST error (not last)
	for (let i = 0; i < logs.length; i++) {
		const line = logs[i];
		if (!line?.trim()) continue;

		// Skip stack traces
		if (line.trim().startsWith("at ")) continue;

		// Skip metadata lines
		if (ignorePatterns.some((pattern) => pattern.test(line))) continue;

		// Check for error patterns
		if (errorPatterns.some((pattern) => pattern.test(line))) {
			// Found an error! Get this line and potentially the next line
			let errorMsg = line.trim();

			// Check if next line provides additional context (but not a stack trace or metadata)
			if (logs[i + 1]) {
				const nextLine = logs[i + 1].trim();
				if (
					nextLine &&
					!nextLine.startsWith("at ") &&
					!ignorePatterns.some((pattern) => pattern.test(nextLine))
				) {
					errorMsg += "\n" + nextLine;
				}
			}

			return errorMsg.length > 500
				? errorMsg.substring(0, 500) + "..."
				: errorMsg;
		}
	}

	// Fallback: look for common error keywords
	const errorKeywords = [
		"Module not found",
		"Cannot find module",
		"Compilation failed",
		"Build failed",
		"SyntaxError:",
		"TypeError:",
		"ReferenceError:",
		"failed to",
		"Failed to",
	];

	for (let i = 0; i < logs.length; i++) {
		const line = logs[i];
		if (!line?.trim()) continue;
		if (ignorePatterns.some((pattern) => pattern.test(line))) continue;

		if (errorKeywords.some((keyword) => line.includes(keyword))) {
			return line.trim().length > 500
				? line.trim().substring(0, 500) + "..."
				: line.trim();
		}
	}

	// Last resort: return last non-empty line that's not metadata
	for (let i = logs.length - 1; i >= 0; i--) {
		const line = logs[i]?.trim();
		if (line && !ignorePatterns.some((pattern) => pattern.test(line))) {
			return line.length > 500 ? line.substring(0, 500) + "..." : line;
		}
	}

	return "Build failed";
}

// Slack payload type
interface SlackPayload {
	blocks: KnownBlock[];
}

// API response types
interface BuildDetailsResponse {
	result?: {
		preview_url?: string;
	};
}

interface SubdomainResponse {
	result?: {
		subdomain?: string;
	};
}

interface LogsResponse {
	result?: {
		lines?: [number, string][];
		truncated?: boolean;
		cursor?: string;
	};
}

function getDashboardUrl(event: CloudflareEvent): string | null {
	const accountId = event.metadata?.accountId;
	const buildUuid = event.payload?.buildUuid;
	const workerName =
		event.source?.workerName ||
		event.payload?.buildTriggerMetadata?.repoName ||
		"worker";

	if (!accountId || !buildUuid) return null;

	return `https://dash.cloudflare.com/${accountId}/workers/services/view/${workerName}/production/builds/${buildUuid}`;
}

function buildSlackBlocks(
	event: CloudflareEvent,
	previewUrl: string | null,
	liveUrl: string | null,
	logs: string[],
): SlackPayload {
	const workerName = event.source?.workerName || "Worker";
	const meta = event.payload?.buildTriggerMetadata;
	const dashUrl = getDashboardUrl(event);
	const commitUrl = getCommitUrl(event);
	const status = getBuildStatus(event);
	const isProduction = isProductionBranch(meta?.branch);

	// Helper to build context elements (reduces duplication)
	function buildContextElements(): MrkdwnElement[] {
		const elements: MrkdwnElement[] = [];

		if (meta?.branch) {
			elements.push({
				type: "mrkdwn",
				text: `*Branch:* \`${meta.branch}\``,
			});
		}

		if (meta?.commitHash) {
			const commitText = meta.commitHash.substring(0, 7);
			elements.push({
				type: "mrkdwn",
				text: `*Commit:* ${commitUrl ? `<${commitUrl}|${commitText}>` : `\`${commitText}\``}`,
			});
		}

		const authorName = extractAuthorName(meta?.author);
		if (authorName) {
			elements.push({ type: "mrkdwn", text: `*Author:* ${authorName}` });
		}

		return elements;
	}

	// Helper to build section block with optional button accessory
	function buildSectionBlock(
		text: string,
		buttonText?: string,
		buttonUrl?: string | null,
		buttonStyle?: Button["style"],
	): SectionBlock {
		const block: SectionBlock = {
			type: "section",
			text: { type: "mrkdwn", text },
		};

		if (buttonText && buttonUrl) {
			block.accessory = {
				type: "button",
				text: { type: "plain_text", text: buttonText },
				url: buttonUrl,
				...(buttonStyle && { style: buttonStyle }),
			};
		}

		return block;
	}

	// Helper to build context block
	function buildContextBlock(elements: MrkdwnElement[]): ContextBlock {
		return { type: "context", elements };
	}

	// ===================
	// SUCCESS: Production
	// ===================
	if (status.isSucceeded && isProduction) {
		const blocks: KnownBlock[] = [
			buildSectionBlock(
				`✅  *Production Deploy*\n*${workerName}*`,
				liveUrl ? "View Worker" : dashUrl ? "View Build" : undefined,
				liveUrl || dashUrl,
			),
		];

		const contextElements = buildContextElements();
		if (contextElements.length > 0) {
			blocks.push(buildContextBlock(contextElements));
		}

		return { blocks };
	}

	// =================
	// SUCCESS: Preview
	// =================
	if (status.isSucceeded && !isProduction) {
		const blocks: KnownBlock[] = [
			buildSectionBlock(
				`✅  *Preview Deploy*\n*${workerName}*`,
				previewUrl ? "View Preview" : dashUrl ? "View Build" : undefined,
				previewUrl || dashUrl,
			),
		];

		const contextElements = buildContextElements();
		if (contextElements.length > 0) {
			blocks.push(buildContextBlock(contextElements));
		}

		return { blocks };
	}

	// =========
	// FAILED
	// =========
	if (status.isFailed) {
		const error = extractBuildError(logs);

		const blocks: KnownBlock[] = [
			buildSectionBlock(
				`❌  *Build Failed*\n*${workerName}*`,
				dashUrl ? "View Logs" : undefined,
				dashUrl,
				"danger",
			),
		];

		const contextElements = buildContextElements();
		if (contextElements.length > 0) {
			blocks.push(buildContextBlock(contextElements));
		}

		// Error message
		blocks.push({
			type: "section",
			text: { type: "mrkdwn", text: `\`\`\`${error}\`\`\`` },
		});

		return { blocks };
	}

	// ===========
	// CANCELLED
	// ===========
	if (status.isCancelled) {
		const blocks: KnownBlock[] = [
			buildSectionBlock(
				`⚠️  *Build Cancelled*\n*${workerName}*`,
				dashUrl ? "View Build" : undefined,
				dashUrl,
			),
		];

		const contextElements = buildContextElements();
		if (contextElements.length > 0) {
			blocks.push(buildContextBlock(contextElements));
		}

		return { blocks };
	}

	// =========
	// FALLBACK
	// =========
	return {
		blocks: [
			{
				type: "section",
				text: { type: "mrkdwn", text: `📢 ${event.type || "Unknown event"}` },
			},
		],
	};
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

// Maximum pages to fetch for logs (prevents infinite loops if API misbehaves)
const MAX_LOG_PAGES = 50;

export default {
	async queue(batch: MessageBatch<CloudflareEvent>, env: Env): Promise<void> {
		if (!env.SLACK_WEBHOOK_URL) {
			console.error("SLACK_WEBHOOK_URL is not configured");
			for (const message of batch.messages) {
				message.ack();
			}
			return;
		}

		for (const message of batch.messages) {
			try {
				const event = message.body;

				if (!event?.type || !event?.payload || !event?.metadata) {
					console.error("Invalid event structure:", JSON.stringify(event));
					message.ack();
					continue;
				}

				// Skip started/queued events - no notification needed
				if (event.type.includes("started") || event.type.includes("queued")) {
					message.ack();
					continue;
				}

				const status = getBuildStatus(event);
				const workerName =
					event.source?.workerName ||
					event.payload.buildTriggerMetadata?.repoName;
				const accountId = event.metadata.accountId;

				let previewUrl: string | null = null;
				let liveUrl: string | null = null;

				// Fetch URLs for successful builds
				if (
					status.isSucceeded &&
					workerName &&
					accountId &&
					env.CLOUDFLARE_API_TOKEN
				) {
					try {
						const buildRes = await fetch(
							`https://api.cloudflare.com/client/v4/accounts/${accountId}/builds/builds/${event.payload.buildUuid}`,
							{
								headers: {
									Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
								},
							},
						);
						const buildData: BuildDetailsResponse = await buildRes.json();

						if (buildData.result?.preview_url) {
							previewUrl = buildData.result.preview_url;
						} else {
							const subRes = await fetch(
								`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`,
								{
									headers: {
										Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
									},
								},
							);
							const subData: SubdomainResponse = await subRes.json();
							if (subData.result?.subdomain) {
								liveUrl = `https://${workerName}.${subData.result.subdomain}.workers.dev`;
							}
						}
					} catch (error) {
						console.error("Failed to fetch URLs:", error);
					}
				}

				// Fetch logs for failed builds
				let logs: string[] = [];

				if (
					status.isFailed &&
					!status.isCancelled &&
					accountId &&
					env.CLOUDFLARE_API_TOKEN
				) {
					try {
						let cursor: string | null = null;
						let pageCount = 0;

						do {
							const logsEndpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/builds/builds/${event.payload.buildUuid}/logs${cursor ? `?cursor=${cursor}` : ""}`;

							const logsRes = await fetch(logsEndpoint, {
								headers: {
									Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
								},
							});
							const logsData: LogsResponse = await logsRes.json();

							if (logsData.result?.lines && logsData.result.lines.length > 0) {
								const lines = logsData.result.lines.map((l) => l[1]);
								logs = logs.concat(lines);
							}

							cursor = logsData.result?.truncated
								? (logsData.result?.cursor ?? null)
								: null;
							pageCount++;
						} while (cursor && pageCount < MAX_LOG_PAGES);

						if (pageCount >= MAX_LOG_PAGES) {
							console.warn(
								`Reached max log pages (${MAX_LOG_PAGES}) for build ${event.payload.buildUuid}`,
							);
						}
					} catch (error) {
						console.error("Failed to fetch logs:", error);
					}
				}

				const slackPayload = buildSlackBlocks(event, previewUrl, liveUrl, logs);

				const response = await fetch(env.SLACK_WEBHOOK_URL, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(slackPayload),
				});

				if (!response.ok) {
					console.error(
						"Slack API error:",
						response.status,
						await response.text(),
					);
				}

				message.ack();
			} catch (error) {
				console.error("Error processing message:", error);
				message.ack();
			}
		}
	},
} satisfies ExportedHandler<Env, CloudflareEvent>;
