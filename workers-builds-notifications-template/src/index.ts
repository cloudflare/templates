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

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface Env {
	/** Slack incoming webhook URL */
	SLACK_WEBHOOK_URL: string;
	/** Cloudflare API token with Workers Builds Configuration: Read permission */
	CLOUDFLARE_API_TOKEN: string;
}

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Cloudflare Workers Builds event structure
 * @see https://developers.cloudflare.com/workers/ci-cd/builds/events/
 */
export interface CloudflareEvent {
	/** Event type (e.g., "cf.workersBuilds.worker.build.succeeded") */
	type: string;
	/** Event source information */
	source: {
		type: string;
		workerName?: string;
	};
	/** Build details */
	payload: {
		buildUuid: string;
		status: string;
		buildOutcome: "success" | "fail" | "cancelled" | "canceled" | null;
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
	/** Event metadata */
	metadata: {
		accountId: string;
		eventSubscriptionId: string;
		eventSchemaVersion: number;
		eventTimestamp: string;
	};
}

// =============================================================================
// HELPER TYPES
// =============================================================================

export interface BuildStatus {
	isSucceeded: boolean;
	isFailed: boolean;
	isCancelled: boolean;
	isStarted: boolean;
}

export interface BuildFormatting {
	emoji: string;
	color: string;
}

// =============================================================================
// EXPORTED HELPER FUNCTIONS (for testing)
// =============================================================================

/**
 * Extracts the worker name from a Cloudflare event
 */
export function getWorkerName(event: CloudflareEvent): string | undefined {
	return (
		event.source.workerName || event.payload.buildTriggerMetadata?.repoName
	);
}

/**
 * Determines the build status from a Cloudflare event
 */
export function getBuildStatus(event: CloudflareEvent): BuildStatus {
	const buildOutcome = event.payload.buildOutcome;
	const isCancelled =
		buildOutcome === "cancelled" || buildOutcome === "canceled";
	const isFailed = event.type.includes("failed") && !isCancelled;
	const isSucceeded = event.type.includes("succeeded");
	const isStarted =
		event.type.includes("started") || event.type.includes("queued");

	return { isSucceeded, isFailed, isCancelled, isStarted };
}

/**
 * Gets emoji and color formatting based on build status
 */
export function getBuildFormatting(status: BuildStatus): BuildFormatting {
	if (status.isSucceeded) {
		return { emoji: "✅", color: "#36a64f" }; // green
	} else if (status.isCancelled) {
		return { emoji: "⚠️", color: "#ffa500" }; // orange
	} else if (status.isFailed) {
		return { emoji: "❌", color: "#ff0000" }; // red
	} else if (status.isStarted) {
		return { emoji: "🚀", color: "#3AA3E3" }; // blue
	}
	return { emoji: "📢", color: "#808080" }; // gray (default)
}

/**
 * Calculates build duration in seconds from timestamps
 */
export function calculateBuildDuration(
	createdAt: string,
	stoppedAt?: string,
): number | null {
	if (!stoppedAt) return null;
	const start = new Date(createdAt).getTime();
	const end = new Date(stoppedAt).getTime();
	return (end - start) / 1000;
}

/**
 * Determines if a branch is a production branch
 */
export function isProductionBranch(branch: string): boolean {
	return ["main", "master"].includes(branch);
}

/**
 * Formats the event object for display in notifications
 */
export function formatEventForDisplay(event: CloudflareEvent): object {
	return {
		type: event.type,
		source: {
			type: event.source.type,
			workerName: event.source.workerName,
		},
		payload: event.payload,
		metadata: event.metadata,
	};
}

/**
 * Builds the dashboard URL for viewing build logs
 */
export function getBuildLogsUrl(
	accountId: string,
	workerName: string,
	buildUuid: string,
): string {
	return `https://dash.cloudflare.com/${accountId}/workers/services/view/${workerName}/production/builds/${buildUuid}`;
}

/**
 * Truncates log text to fit within Slack's limits
 */
export function truncateLogs(logsText: string, maxLength = 30000): string {
	if (logsText.length <= maxLength) {
		return logsText;
	}
	// Keep the end (which has the error), truncate the beginning
	const truncated = logsText.substring(logsText.length - maxLength);
	return "[...truncated]\n" + truncated;
}

/**
 * Builds Slack attachments for the notification
 */
export function buildSlackAttachments(
	event: CloudflareEvent,
	color: string,
	logsText?: string,
	isCancelled?: boolean,
): object[] {
	const attachments: object[] = [
		{
			color,
			text: JSON.stringify(formatEventForDisplay(event), null, 2),
		},
	];

	if (logsText) {
		attachments.push({
			color: isCancelled ? "#ffa500" : "#ff0000",
			title: "📜 Build Logs",
			text: logsText,
		});
	}

	return attachments;
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

/**
 * Fetches build details from the Cloudflare API
 */
async function fetchBuildDetails(
	accountId: string,
	buildUuid: string,
	apiToken: string,
): Promise<{ preview_url?: string } | null> {
	const response = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${accountId}/builds/builds/${buildUuid}`,
		{
			headers: { Authorization: `Bearer ${apiToken}` },
		},
	);
	const data: { result?: { preview_url?: string } } = await response.json();
	return data.result || null;
}

/**
 * Fetches the workers subdomain for an account
 */
async function fetchWorkersSubdomain(
	accountId: string,
	apiToken: string,
): Promise<string | null> {
	const response = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`,
		{
			headers: { Authorization: `Bearer ${apiToken}` },
		},
	);
	const data: { result?: { subdomain?: string } } = await response.json();
	return data.result?.subdomain || null;
}

/**
 * Fetches build logs with pagination
 */
async function fetchBuildLogs(
	accountId: string,
	buildUuid: string,
	apiToken: string,
): Promise<string[]> {
	const allLines: string[] = [];
	let cursor: string | null = null;

	do {
		const endpoint = cursor
			? `https://api.cloudflare.com/client/v4/accounts/${accountId}/builds/builds/${buildUuid}/logs?cursor=${cursor}`
			: `https://api.cloudflare.com/client/v4/accounts/${accountId}/builds/builds/${buildUuid}/logs`;

		const response = await fetch(endpoint, {
			headers: { Authorization: `Bearer ${apiToken}` },
		});
		const data: {
			result?: {
				lines?: [number, string][];
				truncated?: boolean;
				cursor?: string;
			};
		} = await response.json();

		if (data.result?.lines?.length) {
			const lines = data.result.lines.map((l) => l[1]);
			allLines.push(...lines);
		}

		cursor = data.result?.truncated ? (data.result?.cursor ?? null) : null;
	} while (cursor);

	return allLines;
}

// =============================================================================
// CORE MESSAGE PROCESSOR
// =============================================================================

/**
 * Processes a single build event and sends notification
 */
export async function processMessage(
	event: CloudflareEvent,
	env: Env,
): Promise<void> {
	const workerName = getWorkerName(event);
	const status = getBuildStatus(event);
	const { emoji, color } = getBuildFormatting(status);

	let messageText = `${emoji} ${event.type}${status.isCancelled ? " (cancelled)" : ""}`;
	let logsText = "";

	// SUCCESS: Add Preview or Live URL
	if (status.isSucceeded && workerName) {
		const buildData = await fetchBuildDetails(
			event.metadata.accountId,
			event.payload.buildUuid,
			env.CLOUDFLARE_API_TOKEN,
		);

		if (buildData?.preview_url) {
			messageText += `\n🔮 <${buildData.preview_url}|Preview URL>`;
		} else {
			const subdomain = await fetchWorkersSubdomain(
				event.metadata.accountId,
				env.CLOUDFLARE_API_TOKEN,
			);
			if (subdomain) {
				messageText += `\n🌐 <https://${workerName}.${subdomain}.workers.dev|Live Worker>`;
			}
		}
	}

	// FAILED/CANCELLED: Add Logs Link and Fetch Logs
	if (status.isFailed || status.isCancelled) {
		const logsWorkerName = getWorkerName(event);

		if (logsWorkerName) {
			const logsUrl = getBuildLogsUrl(
				event.metadata.accountId,
				logsWorkerName,
				event.payload.buildUuid,
			);
			messageText += `\n📋 <${logsUrl}|View Build Logs>`;

			const logLines = await fetchBuildLogs(
				event.metadata.accountId,
				event.payload.buildUuid,
				env.CLOUDFLARE_API_TOKEN,
			);

			if (logLines.length > 0) {
				logsText = truncateLogs(logLines.join("\n"));
			}
		}
	}

	// Build and send Slack notification
	const attachments = buildSlackAttachments(
		event,
		color,
		logsText || undefined,
		status.isCancelled,
	);

	await fetch(env.SLACK_WEBHOOK_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			text: messageText,
			attachments,
		}),
	});
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

export default {
	async queue(batch: MessageBatch<CloudflareEvent>, env: Env): Promise<void> {
		for (const message of batch.messages) {
			try {
				await processMessage(message.body, env);
				message.ack();
			} catch (error) {
				console.error("Error processing message:", error);
				// Still acknowledge to prevent infinite retries
				message.ack();
			}
		}
	},
} satisfies ExportedHandler<Env, CloudflareEvent>;
