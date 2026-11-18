/**
 * Type definitions for Workers Builds events and related structures.
 */

// =============================================================================
// ENVIRONMENT
// =============================================================================

export interface Env {
	SLACK_WEBHOOK_URL: string;
	CLOUDFLARE_API_TOKEN: string;
}

// =============================================================================
// CLOUDFLARE BUILD EVENTS
// =============================================================================

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
		buildTriggerMetadata?: BuildTriggerMetadata;
	};
	metadata: {
		accountId: string;
		eventSubscriptionId: string;
		eventSchemaVersion: number;
		eventTimestamp: string;
	};
}

export interface BuildTriggerMetadata {
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
}

// =============================================================================
// BUILD STATUS
// =============================================================================

export interface BuildStatus {
	isSucceeded: boolean;
	isFailed: boolean;
	isCancelled: boolean;
}

// =============================================================================
// API RESPONSES
// =============================================================================

export interface BuildDetailsResponse {
	result?: {
		preview_url?: string;
	};
}

export interface SubdomainResponse {
	result?: {
		subdomain?: string;
	};
}

export interface LogsResponse {
	result?: {
		lines?: [number, string][];
		truncated?: boolean;
		cursor?: string;
	};
}
