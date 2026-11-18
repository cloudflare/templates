/**
 * Slack Block Kit message formatting for build notifications.
 */

import type {
	SectionBlock,
	ContextBlock,
	KnownBlock,
	MrkdwnElement,
	Button,
} from "@slack/types";

import type { CloudflareEvent } from "./types";
import {
	getBuildStatus,
	isProductionBranch,
	extractAuthorName,
	getCommitUrl,
	getDashboardUrl,
	extractBuildError,
} from "./helpers";

// =============================================================================
// TYPES
// =============================================================================

export interface SlackPayload {
	text?: string;
	blocks: KnownBlock[];
}

// =============================================================================
// BLOCK BUILDERS
// =============================================================================

/**
 * Builds a section block with optional button accessory.
 */
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

/**
 * Builds a context block from mrkdwn elements.
 */
function buildContextBlock(elements: MrkdwnElement[]): ContextBlock {
	return { type: "context", elements };
}

/**
 * Builds context elements (branch, commit, author) from event metadata.
 */
function buildContextElements(event: CloudflareEvent): MrkdwnElement[] {
	const meta = event.payload?.buildTriggerMetadata;
	const commitUrl = getCommitUrl(event);
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

// =============================================================================
// MESSAGE BUILDERS
// =============================================================================

function buildSuccessMessage(
	event: CloudflareEvent,
	isProduction: boolean,
	previewUrl: string | null,
	liveUrl: string | null,
): SlackPayload {
	const workerName = event.source?.workerName || "Worker";
	const dashUrl = getDashboardUrl(event);

	const title = isProduction ? "Production Deploy" : "Preview Deploy";
	const buttonText = isProduction
		? liveUrl
			? "View Worker"
			: "View Build"
		: previewUrl
			? "View Preview"
			: "View Build";
	const buttonUrl = isProduction ? liveUrl || dashUrl : previewUrl || dashUrl;

	const blocks: KnownBlock[] = [
		buildSectionBlock(`✅  *${title}*\n*${workerName}*`, buttonText, buttonUrl),
	];

	const contextElements = buildContextElements(event);
	if (contextElements.length > 0) {
		blocks.push(buildContextBlock(contextElements));
	}

	return { text: `✅ ${title}: ${workerName}`, blocks };
}

function buildFailureMessage(
	event: CloudflareEvent,
	logs: string[],
): SlackPayload {
	const workerName = event.source?.workerName || "Worker";
	const dashUrl = getDashboardUrl(event);
	const error = extractBuildError(logs);

	const blocks: KnownBlock[] = [
		buildSectionBlock(
			`❌  *Build Failed*\n*${workerName}*`,
			dashUrl ? "View Logs" : undefined,
			dashUrl,
			"danger",
		),
	];

	const contextElements = buildContextElements(event);
	if (contextElements.length > 0) {
		blocks.push(buildContextBlock(contextElements));
	}

	// Error message in code block
	blocks.push({
		type: "section",
		text: { type: "mrkdwn", text: `\`\`\`${error}\`\`\`` },
	});

	return { text: `❌ Build Failed: ${workerName}`, blocks };
}

function buildCancelledMessage(event: CloudflareEvent): SlackPayload {
	const workerName = event.source?.workerName || "Worker";
	const dashUrl = getDashboardUrl(event);

	const blocks: KnownBlock[] = [
		buildSectionBlock(
			`⚠️  *Build Cancelled*\n*${workerName}*`,
			dashUrl ? "View Build" : undefined,
			dashUrl,
		),
	];

	const contextElements = buildContextElements(event);
	if (contextElements.length > 0) {
		blocks.push(buildContextBlock(contextElements));
	}

	return { text: `⚠️ Build Cancelled: ${workerName}`, blocks };
}

function buildFallbackMessage(event: CloudflareEvent): SlackPayload {
	return {
		text: `📢 ${event.type || "Unknown event"}`,
		blocks: [
			{
				type: "section",
				text: { type: "mrkdwn", text: `📢 ${event.type || "Unknown event"}` },
			},
		],
	};
}

// =============================================================================
// MAIN EXPORTS
// =============================================================================

/**
 * Builds a Slack Block Kit payload for a build event.
 */
export function buildSlackPayload(
	event: CloudflareEvent,
	previewUrl: string | null,
	liveUrl: string | null,
	logs: string[],
): SlackPayload {
	const status = getBuildStatus(event);
	const meta = event.payload?.buildTriggerMetadata;
	const isProduction = isProductionBranch(meta?.branch);

	if (status.isSucceeded) {
		return buildSuccessMessage(event, isProduction, previewUrl, liveUrl);
	}

	if (status.isFailed) {
		return buildFailureMessage(event, logs);
	}

	if (status.isCancelled) {
		return buildCancelledMessage(event);
	}

	return buildFallbackMessage(event);
}

/**
 * Sends a payload to a Slack webhook.
 */
export async function sendSlackNotification(
	webhookUrl: string,
	payload: SlackPayload,
): Promise<void> {
	const body = JSON.stringify({
		...payload,
		text: payload.text || "Workers Build Notification",
	});

	const response = await fetch(webhookUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body,
	});

	if (!response.ok) {
		const responseText = await response.text();
		console.error(
			`Slack API error: ${response.status} - ${responseText}. Payload: ${body}`,
		);
	}
}
