import type { ComponentNeed } from "./types";

export interface DecompositionResult {
	needs: ComponentNeed[];
	/**
	 * Set when the AI call failed or returned unparseable output and the
	 * orchestrator fell back to treating the whole intent as a single need.
	 * Callers should surface this to the UI / API consumer — a single-need
	 * fallback produces notably weaker recommendations.
	 */
	fallback?: "ai_error" | "ai_empty";
}

/**
 * Decompose a user's outcome-based intent into component product needs.
 *
 * Example: "outfit my 3-year-old for skiing" →
 *   [{ need: "toddler skis", priority: "essential", searchTerms: ["skis", "toddler skis"] },
 *    { need: "ski boots", priority: "essential", searchTerms: ["ski boots", "toddler boots"] },
 *    { need: "ski helmet", priority: "essential", searchTerms: ["helmet", "ski helmet"] },
 *    ...]
 */
export async function decomposeIntent(
	intent: string,
	ai: Ai,
	model: string,
): Promise<DecompositionResult> {
	const systemPrompt = `You are a shopping expert. Given a shopping intent, list the individual products needed.

Rules:
- Each item in the list must be ONE specific product, not a combination (e.g., "ski gloves" not "hat and gloves").
- Start with the most important/obvious items for this activity.
- For "outfit" or "gear" intents, always include the primary equipment first (e.g., skis for skiing, tent for camping).
- Include 5-8 items total.
- "essential" = you cannot do the activity without it. Safety gear (helmets, protective equipment) is ALWAYS essential for children.
- "recommended" = significantly improves the experience.
- "optional" = nice to have.
- searchTerms should be 2-4 short phrases a shopper would search for.

Respond in valid JSON only, no markdown:
{"needs": [{"need": "...", "priority": "essential", "searchTerms": ["...", "..."]}]}`;

	const userMessage = `Shopping intent: "${intent}"`;

	try {
		// `ai.run`'s overload signatures key off a union of known model IDs.
		// We accept the model as a string from env so the template works with
		// whatever model the account has access to — cast through unknown.
		const response = (await ai.run(
			model as unknown as Parameters<Ai["run"]>[0],
			{
				messages: [
					{ role: "system", content: systemPrompt },
					{ role: "user", content: userMessage },
				],
				max_tokens: 1024,
				temperature: 0.3,
			},
		)) as { response?: string };

		const text = response.response || "";
		const jsonMatch = text.match(/\{[\s\S]*\}/);
		if (!jsonMatch) {
			console.error(
				"[decompose] No JSON in decomposition response:",
				text.substring(0, 200),
			);
			return { needs: singleNeedFallback(intent), fallback: "ai_empty" };
		}

		const parsed = JSON.parse(jsonMatch[0]) as { needs: ComponentNeed[] };
		if (!parsed.needs || parsed.needs.length === 0) {
			return { needs: singleNeedFallback(intent), fallback: "ai_empty" };
		}
		return { needs: parsed.needs };
	} catch (err) {
		console.error("[decompose] Intent decomposition failed:", err);
		return { needs: singleNeedFallback(intent), fallback: "ai_error" };
	}
}

function singleNeedFallback(intent: string): ComponentNeed[] {
	return [
		{
			need: intent,
			priority: "essential",
			searchTerms: intent.split(/\s+/).filter((w) => w.length > 2),
		},
	];
}
