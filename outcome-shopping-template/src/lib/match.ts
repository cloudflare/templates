import type { ComponentNeed, SourcedProduct, Recommendation } from "./types";

/**
 * Keyword relevance score for a product given a need's search terms.
 * Checks product name, category, and use case tags.
 */
function scoreRelevance(product: SourcedProduct, needTerms: string[]): number {
	const haystack = [
		product.name.toLowerCase(),
		product.category.toLowerCase(),
		...product.useCaseTags.map((t) => t.toLowerCase()),
	].join(" ");

	let score = 0;
	for (const term of needTerms) {
		if (haystack.includes(term)) score += 2;
		for (const word of term.split(/\s+/)) {
			if (word.length > 2 && haystack.includes(word)) score += 1;
		}
	}
	return score;
}

/**
 * Match a single need against the product catalog.
 *
 * Per-need matching is more reliable than batch matching with small
 * models — the model only has to pick the best product from a list, not
 * juggle multiple needs and indices simultaneously.
 */
async function matchSingleNeed(
	need: ComponentNeed,
	products: SourcedProduct[],
	alreadyUsedSlugs: Set<string>,
	intent: string,
	ai: Ai,
	model: string,
): Promise<{
	product: SourcedProduct | null;
	reasoning: string;
	alternative: SourcedProduct | null;
}> {
	const productList = products
		.map((p, i) => {
			const used = alreadyUsedSlugs.has(p.slug)
				? " [ALREADY SELECTED FOR ANOTHER NEED]"
				: "";
			return `${i}. "${p.name}" — $${p.price} at ${p.merchantName}${used}\n   ${p.agentSummary}\n   Tags: ${p.useCaseTags.join(", ")}`;
		})
		.join("\n\n");

	const systemPrompt = `You are a shopping assistant. Given a specific product need and a list of available products, pick the BEST matching product.

Rules:
- Pick the product most relevant to the stated need. Consider the product name, summary, tags, and price.
- Products marked [ALREADY SELECTED FOR ANOTHER NEED] should be avoided unless they are the ONLY reasonable match.
- If no product is a reasonable match for this need, set "productIndex" to -1.
- Also pick one alternative product (different from your main pick) if one exists, or set "alternativeIndex" to -1.
- The alternative must ALSO be relevant to this specific need — do not pick a random product.

Respond in valid JSON only, no markdown:
{"productIndex": 3, "reasoning": "1-2 sentences why this product fits", "alternativeIndex": 5}`;

	const userMessage = `Original shopping intent: "${intent}"

NEED: ${need.need} (${need.priority})
Search terms: ${need.searchTerms.join(", ")}

PRODUCTS:
${productList}`;

	try {
		// See note in decompose.ts — model ID comes from env as a plain string.
		const response = (await ai.run(
			model as unknown as Parameters<Ai["run"]>[0],
			{
				messages: [
					{ role: "system", content: systemPrompt },
					{ role: "user", content: userMessage },
				],
				max_tokens: 256,
				temperature: 0.1,
			},
		)) as { response?: string };

		const text = response.response || "";
		// Greedy match — the model's response can contain nested braces inside
		// the `reasoning` string, and a non-greedy match would truncate at the
		// first `}` and break JSON parsing.
		const jsonMatch = text.match(/\{[\s\S]*\}/);
		if (!jsonMatch) {
			return { product: null, reasoning: "", alternative: null };
		}

		const parsed = JSON.parse(jsonMatch[0]) as {
			productIndex: number;
			reasoning: string;
			alternativeIndex?: number;
		};

		const pidx = parsed.productIndex;
		let product =
			Number.isInteger(pidx) && pidx >= 0 && pidx < products.length
				? products[pidx]
				: null;

		const aidx = parsed.alternativeIndex;
		let alternative =
			aidx !== undefined &&
			Number.isInteger(aidx) &&
			aidx >= 0 &&
			aidx < products.length
				? products[aidx]
				: null;

		if (alternative && product && alternative.slug === product.slug) {
			alternative = null;
		}

		// Validation: if the alternative is a stronger keyword match than the primary,
		// swap them. This catches common small-model index confusion.
		if (product && alternative) {
			const needTerms = need.searchTerms.map((t) => t.toLowerCase());
			const primaryScore = scoreRelevance(product, needTerms);
			const altScore = scoreRelevance(alternative, needTerms);
			if (altScore > primaryScore) {
				[product, alternative] = [alternative, product];
			}
		}

		return {
			product,
			reasoning: parsed.reasoning || "",
			alternative,
		};
	} catch (err) {
		console.error(`[match] Failed for need "${need.need}":`, err);
		return { product: null, reasoning: "", alternative: null };
	}
}

/**
 * Match every component need against the unified product catalog.
 * Processes needs sequentially so each call knows what has already been
 * selected — this encourages variety across merchants and avoids
 * recommending the same product twice.
 */
export async function matchProductsToNeeds(
	needs: ComponentNeed[],
	products: SourcedProduct[],
	intent: string,
	ai: Ai,
	model: string,
): Promise<{
	recommendations: Recommendation[];
	unfulfilledNeeds: ComponentNeed[];
}> {
	const recommendations: Recommendation[] = [];
	const unfulfilledNeeds: ComponentNeed[] = [];
	const usedSlugs = new Set<string>();

	for (const need of needs) {
		const result = await matchSingleNeed(
			need,
			products,
			usedSlugs,
			intent,
			ai,
			model,
		);

		if (result.product) {
			usedSlugs.add(result.product.slug);
			recommendations.push({
				need: need.need,
				priority: need.priority,
				product: result.product,
				reasoning: result.reasoning,
				alternatives: result.alternative ? [result.alternative] : undefined,
			});
		} else {
			unfulfilledNeeds.push(need);
		}
	}

	return { recommendations, unfulfilledNeeds };
}
