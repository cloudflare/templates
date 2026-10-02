export const CONVERSATION_RETENTION_MS = 60 * 60 * 1_000;

export interface CallClaim {
	activeCallId: string;
	replacedCallId: string | null;
}

export function claimCall(
	currentCallId: string | null,
	connectionId: string,
): CallClaim {
	return {
		activeCallId: connectionId,
		replacedCallId:
			currentCallId !== null && currentCallId !== connectionId
				? currentCallId
				: null,
	};
}

export function releaseCall(
	currentCallId: string | null,
	connectionId: string,
): { activeCallId: string | null; released: boolean } {
	const released = currentCallId === connectionId;
	return { activeCallId: released ? null : currentCallId, released };
}

export function conversationCleanupDeadline(timestamp: number): number {
	return timestamp + CONVERSATION_RETENTION_MS;
}

export function nextConversationCleanupDeadline(
	oldestTimestamp: number | null,
	now = Date.now(),
): number {
	return oldestTimestamp === null
		? conversationCleanupDeadline(now)
		: Math.max(now, conversationCleanupDeadline(oldestTimestamp));
}

export function normalizeConversationCleanupScheduleTime(
	deadlineMs: number,
): number {
	return Math.floor(deadlineMs / 1_000) * 1_000;
}
