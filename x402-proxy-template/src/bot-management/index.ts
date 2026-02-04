/**
 * Bot Management Filtering (Optional)
 * Requires Bot Management for Enterprise.
 *
 * Non-Bot Management users can ignore this entire directory.
 *
 * When Bot Management data is available and bot_score_threshold is configured:
 *   - Humans (bot score > threshold) pass through FREE
 *   - Excepted bots (detection ID in except_detection_ids) pass through FREE
 *   - All other traffic must pay
 */

import type { ProtectedRouteConfig } from "../auth";

/**
 * Check if request has a Bot Management exception (human or excepted bot).
 * Returns false if Bot Management filtering is not configured or data unavailable.
 *
 * @param request - The incoming request (to extract cf.botManagement)
 * @param config - Protected route configuration
 * @returns true if request should bypass payment, false if payment required
 */
export function hasBotManagementException(
	request: Request,
	config: ProtectedRouteConfig
): boolean {
	// No threshold configured = no Bot Management filtering (all traffic must pay)
	if (config.bot_score_threshold === undefined) {
		return false;
	}

	// Access Bot Management data via Cloudflare's cf object
	// Types are defined in worker-configuration.d.ts (IncomingRequestCfProperties)
	const cf = (request as { cf?: IncomingRequestCfProperties }).cf;
	const botManagement = cf?.botManagement;

	// No Bot Management data = can't evaluate, require payment
	if (!botManagement) {
		console.warn(
			"[x402-proxy] Bot Management Filtering configured but cf.botManagement not available. " +
				"Requires Bot Management for Enterprise. Falling back to payment requirement."
		);
		return false;
	}

	const botScore = botManagement.score;

	// No score available = can't evaluate, require payment (safe default)
	if (botScore === undefined || botScore === null) {
		console.warn(
			"[x402-proxy] Bot Management data available but score is missing. " +
				"Falling back to payment requirement."
		);
		return false;
	}

	const detectionIds = botManagement.detectionIds ?? [];

	// Check 1: Is this a human? (bot score ABOVE threshold)
	if (botScore > config.bot_score_threshold) {
		return true; // Human - bypass payment
	}

	// Check 2: Is this an excepted bot? (detection ID in exception list)
	if (config.except_detection_ids && config.except_detection_ids.length > 0) {
		const isExcepted = detectionIds.some((id) =>
			config.except_detection_ids!.includes(id)
		);
		if (isExcepted) {
			return true; // Excepted bot - bypass payment
		}
	}

	// Neither human nor excepted bot - require payment
	return false;
}
