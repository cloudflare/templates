/**
 * Helper functions for processing build events.
 */

import type { CloudflareEvent, BuildStatus } from "./types";

// =============================================================================
// BUILD STATUS
// =============================================================================

/**
 * Determines the build status from a Cloudflare event.
 * Handles both "canceled" and "cancelled" spellings.
 */
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

// =============================================================================
// BRANCH DETECTION
// =============================================================================

/**
 * Determines if a branch is a production branch.
 * Returns true for main, master, production, prod (case-insensitive).
 * Returns true for undefined (defaults to production).
 */
export function isProductionBranch(branch: string | undefined): boolean {
	if (!branch) return true;
	return ["main", "master", "production", "prod"].includes(
		branch.toLowerCase(),
	);
}

// =============================================================================
// METADATA EXTRACTION
// =============================================================================

/**
 * Extracts the author name from an email address.
 * "john.doe@example.com" -> "john.doe"
 * "johndoe" -> "johndoe"
 * "@username" -> "@username" (edge case)
 */
export function extractAuthorName(author: string | undefined): string | null {
	if (!author) return null;
	if (author.includes("@")) {
		const name = author.split("@")[0];
		return name || author; // Fallback if split yields empty string
	}
	return author;
}

/**
 * Generates a commit URL for GitHub or GitLab.
 * Returns null for unsupported providers or missing metadata.
 */
export function getCommitUrl(event: CloudflareEvent): string | null {
	const meta = event.payload?.buildTriggerMetadata;
	if (!meta?.repoName || !meta?.commitHash || !meta?.providerAccountName) {
		return null;
	}

	if (meta.providerType === "github") {
		return `https://github.com/${meta.providerAccountName}/${meta.repoName}/commit/${meta.commitHash}`;
	}
	if (meta.providerType === "gitlab") {
		return `https://gitlab.com/${meta.providerAccountName}/${meta.repoName}/-/commit/${meta.commitHash}`;
	}
	return null;
}

/**
 * Generates a Cloudflare dashboard URL for a build.
 */
export function getDashboardUrl(event: CloudflareEvent): string | null {
	const accountId = event.metadata?.accountId;
	const buildUuid = event.payload?.buildUuid;
	const workerName =
		event.source?.workerName ||
		event.payload?.buildTriggerMetadata?.repoName ||
		"worker";

	if (!accountId || !buildUuid) return null;

	return `https://dash.cloudflare.com/${accountId}/workers/services/view/${workerName}/production/builds/${buildUuid}`;
}

// =============================================================================
// ERROR EXTRACTION
// =============================================================================

// Lines to ignore - these are build metadata, not errors
const IGNORE_PATTERNS = [
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
const ERROR_PATTERNS = [
	/^✘\s*\[ERROR\]/i, // ✘ [ERROR] ...
	/^\[ERROR\]/i, // [ERROR] ...
	/^ERROR:/i, // ERROR: ...
	/^Error:/, // Error: ...
	/^❌/, // ❌ ...
];

// Fallback error keywords
const ERROR_KEYWORDS = [
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

/**
 * Extracts the most relevant error message from build logs.
 * Looks for the FIRST error (root cause) rather than the last.
 * Truncates long errors to 500 characters.
 */
export function extractBuildError(logs: string[]): string {
	if (!logs || logs.length === 0) {
		return "No logs available";
	}

	// Look for the FIRST error (not last) - it's usually the root cause
	for (let i = 0; i < logs.length; i++) {
		const line = logs[i];
		if (!line?.trim()) continue;
		if (line.trim().startsWith("at ")) continue; // Skip stack traces
		if (IGNORE_PATTERNS.some((pattern) => pattern.test(line))) continue;

		if (ERROR_PATTERNS.some((pattern) => pattern.test(line))) {
			let errorMsg = line.trim();

			// Include next line as context if it's not a stack trace or metadata
			if (logs[i + 1]) {
				const nextLine = logs[i + 1].trim();
				if (
					nextLine &&
					!nextLine.startsWith("at ") &&
					!IGNORE_PATTERNS.some((pattern) => pattern.test(nextLine))
				) {
					errorMsg += "\n" + nextLine;
				}
			}

			return truncate(errorMsg, 500);
		}
	}

	// Fallback: look for common error keywords
	for (let i = 0; i < logs.length; i++) {
		const line = logs[i];
		if (!line?.trim()) continue;
		if (IGNORE_PATTERNS.some((pattern) => pattern.test(line))) continue;

		if (ERROR_KEYWORDS.some((keyword) => line.includes(keyword))) {
			return truncate(line.trim(), 500);
		}
	}

	// Last resort: return last non-empty, non-metadata line
	for (let i = logs.length - 1; i >= 0; i--) {
		const line = logs[i]?.trim();
		if (line && !IGNORE_PATTERNS.some((pattern) => pattern.test(line))) {
			return truncate(line, 500);
		}
	}

	return "Build failed";
}

function truncate(str: string, maxLength: number): string {
	return str.length > maxLength ? str.substring(0, maxLength) + "..." : str;
}
