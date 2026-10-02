/**
 * Product Enrichment Module
 *
 * Uses Workers AI to transform raw product specs into agent-friendly
 * natural language descriptions.
 *
 * This is the core value-add: turning "polycarbonate cap, DIN 0.75-3.0"
 * into "lightweight skis for toddlers, bindings release easily for safety."
 *
 * The enrichment runs at the edge, is cached in KV, and updates when
 * inventory changes.
 */

import type { RawProduct, EnrichedProduct } from "../lib/types";

function buildEnrichmentPrompt(vertical: string): string {
	return `You are a product expert helping AI shopping agents understand ${vertical}. 
Given a product's raw specifications and description, generate:

1. An "agentSummary" (2-3 sentences): Describe what this product IS and what it DOES in plain language that helps an AI agent recommend it. Focus on use cases and practical outcomes, not technical specs. Write as if advising a friend who asked "what's this good for?"

2. "useCaseTags" (3-6 tags): Short phrases describing when/where/how someone would use this product.

3. "highlights" (3-4 bullet points): The key things that matter to a buyer, translated from specs to benefits.

4. "bestFor" (1 sentence): Who specifically should buy this.

Respond in valid JSON only, no markdown fencing:
{"agentSummary": "...", "useCaseTags": ["...", "..."], "highlights": ["...", "..."], "bestFor": "..."}`;
}

/**
 * Minimal interface for Workers AI text generation.
 * Uses a loose return type to stay compatible with the Cloudflare `Ai` binding,
 * which returns a union across all model output types.
 */
interface AiTextGeneration {
	run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

const DEFAULT_AI_MODEL = "@cf/google/gemma-4-26b-a4b-it";

/**
 * Enrich a single product using Workers AI.
 *
 * @param model - Workers AI model ID. Defaults to Gemma 4 26B.
 *   Override via the AI_MODEL env var to use a different model.
 */
export async function enrichProduct(
	product: RawProduct,
	ai: AiTextGeneration,
	vertical: string,
	model: string = DEFAULT_AI_MODEL,
): Promise<EnrichedProduct> {
	const specsText = Object.entries(product.specs)
		.map(([key, value]) => `${key.replace(/_/g, " ")}: ${value}`)
		.join("\n");

	const productContext = `Product: ${product.name}
Category: ${product.category}
Price: $${product.price}
Description: ${product.description}
In Stock: ${product.inStock ? `Yes (${product.stockCount} available)` : "No - out of stock"}

Raw Specifications:
${specsText}`;

	try {
		const result = (await ai.run(model, {
			messages: [
				{ role: "system", content: buildEnrichmentPrompt(vertical) },
				{ role: "user", content: productContext },
			],
		})) as { response?: string };

		const responseText = result.response ?? "";
		const jsonMatch = responseText.match(/\{[\s\S]*\}/);
		if (!jsonMatch) {
			return fallbackEnrichment(product);
		}

		const parsed = JSON.parse(jsonMatch[0]);

		return {
			...product,
			agentSummary:
				parsed.agentSummary ?? fallbackEnrichment(product).agentSummary,
			useCaseTags: Array.isArray(parsed.useCaseTags) ? parsed.useCaseTags : [],
			highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
			bestFor: parsed.bestFor ?? "",
		};
	} catch (err) {
		console.error(
			`Enrichment failed for ${product.slug}: ${err}. Using fallback.`,
		);
		return fallbackEnrichment(product);
	}
}

/**
 * Enrich an entire catalog. Runs enrichments concurrently (batched to avoid rate limits).
 *
 * @param model - Workers AI model ID. Override via the AI_MODEL env var.
 */
export async function enrichCatalog(
	products: RawProduct[],
	ai: AiTextGeneration,
	vertical = "general retail",
	model: string = DEFAULT_AI_MODEL,
): Promise<EnrichedProduct[]> {
	// Batch in groups of 5 to stay within Workers AI concurrent request limits.
	// Each batch runs in parallel; batches run sequentially.
	const BATCH_SIZE = 5;
	const results: EnrichedProduct[] = [];

	for (let i = 0; i < products.length; i += BATCH_SIZE) {
		const batch = products.slice(i, i + BATCH_SIZE);
		const enriched = await Promise.all(
			batch.map((p) => enrichProduct(p, ai, vertical, model)),
		);
		results.push(...enriched);
	}

	return results;
}

/**
 * Fallback enrichment when Workers AI is unavailable (e.g., local dev).
 *
 * These are hand-written per product to demonstrate the transformation
 * clearly. In production, Workers AI generates these dynamically.
 * The point of the fallback is to show what the output SHOULD look like,
 * not to generate it algorithmically from specs.
 */
export function fallbackEnrichment(product: RawProduct): EnrichedProduct {
	const custom = FALLBACK_ENRICHMENTS[product.slug];
	if (custom) {
		return { ...product, ...custom };
	}
	// Generic fallback for unknown products
	return {
		...product,
		agentSummary: `${product.name} — ${product.description} Priced at $${product.price}.`,
		useCaseTags: [product.category],
		highlights: Object.entries(product.specs)
			.slice(0, 3)
			.map(([k, v]) => `${k}: ${v}`),
		bestFor: `Anyone looking for ${product.category} products.`,
	};
}

/**
 * Hand-written enrichments that demonstrate the transformation.
 * This is what Workers AI would generate in production.
 *
 * BEFORE (raw): "polycarbonate cap, DIN 0.75-3.0, foam composite, 1.2 kg"
 * AFTER (enriched): "Lightweight plastic skis a toddler can carry..."
 */
const FALLBACK_ENRICHMENTS: Record<
	string,
	Pick<
		EnrichedProduct,
		"agentSummary" | "useCaseTags" | "highlights" | "bestFor"
	>
> = {
	"little-ripper-70-skis": {
		agentSummary:
			"Lightweight plastic skis designed for toddlers skiing for the very first time. " +
			"Short enough for a 3-year-old to control on a bunny hill, with step-in bindings " +
			"simple enough for parents to operate while wearing gloves. The foam core keeps " +
			"them under 1.2 kg so a small child can carry them without help.",
		useCaseTags: [
			"first ski lesson",
			"resort bunny hill",
			"backyard snow play",
			"ski school alternative",
			"toddler ages 2-4",
		],
		highlights: [
			"Under 1.2 kg per pair — light enough for a toddler to carry",
			"Step-in bindings work with mittens on",
			"Plastic construction won't chip or crack when dropped on concrete",
			"Low DIN range (0.75-3.0) means bindings release easily for safety",
		],
		bestFor:
			"First-time skiers ages 2-4 who need lightweight, forgiving gear to build confidence on gentle slopes.",
	},
	"snow-sprout-helmet": {
		agentSummary:
			"A properly fitted toddler ski helmet that actually fits heads as small as 48cm — " +
			"most kid helmets start at 52cm and wobble on a 3-year-old. Dial-adjust sizing means " +
			"it grows with the child for 2-3 seasons instead of being replaced every year. " +
			"Built-in ear pads keep little ears warm without needing a hat underneath.",
		useCaseTags: [
			"toddler skiing",
			"ski school",
			"sledding",
			"snow play",
			"ages 2-5",
		],
		highlights: [
			"Starts at 48cm — actually fits a 2-3 year old (most helmets don't)",
			"Dial-adjust grows with your child for 2-3 seasons",
			"Integrated ear pads — no fumbling with a hat underneath",
			"Only 350g — toddlers won't fight wearing it",
		],
		bestFor:
			"Toddlers and preschoolers (ages 2-5) who need a helmet that actually fits their small head.",
	},
	"tiny-tracks-boots": {
		agentSummary:
			"Toddler ski boots with a single buckle and a wide rear opening — designed so " +
			"parents aren't wrestling a squirming 3-year-old's foot into a stiff boot in a " +
			"parking lot. Insulated to -10C so little toes stay warm through a full morning " +
			"lesson. Compatible with all standard toddler bindings.",
		useCaseTags: [
			"first ski boots",
			"toddler ski lessons",
			"resort skiing",
			"ages 2-5",
		],
		highlights: [
			"Single buckle — no complicated latches for cold fingers",
			"Wide rear opening so a toddler's foot slides in without a fight",
			"Insulated to -10C for full-morning warmth",
			"Removable liner for drying overnight",
		],
		bestFor:
			"Toddlers (ages 2-5) getting into ski boots for the first time, and parents who value their sanity in the lodge parking lot.",
	},
	"powder-pup-snow-suit": {
		agentSummary:
			"A one-piece snow suit that keeps a toddler warm and dry on the mountain without " +
			"any gaps where snow can get in. The full-length zipper makes diaper changes possible " +
			"without removing the whole suit. Fold-over mitt cuffs mean one less thing to lose, " +
			"and reflective trim helps you spot your kid on a crowded bunny hill.",
		useCaseTags: [
			"toddler skiing",
			"snow play",
			"sledding",
			"winter outdoor play",
			"ages 2-5",
		],
		highlights: [
			"One-piece design — no gaps where snow creeps in at the waist",
			"Diaper-friendly zipper design for quick changes",
			"Fold-over mitt cuffs so you don't lose gloves on the chairlift",
			"Reflective trim to spot your toddler on a crowded slope",
		],
		bestFor:
			"Parents who want to keep their toddler warm, dry, and visible on the mountain without fighting 5 separate layers.",
	},
	"mountain-cub-goggles": {
		agentSummary:
			"Toddler ski goggles that actually stay on a small face. The flexible TPU frame " +
			"doesn't press on tiny noses, and the adjustable strap has silicone grip so it " +
			"doesn't slide around on a helmet. The S1 lens is bright enough for cloudy resort " +
			"days without being too dark for a child who's already nervous about everything.",
		useCaseTags: [
			"toddler skiing",
			"helmet-compatible",
			"cloudy day skiing",
			"first-time skier",
			"ages 2-5",
		],
		highlights: [
			"Flexible frame that doesn't press on a toddler's nose",
			"Silicone-grip strap stays put on a helmet",
			"S1 lens — bright enough for cloudy days, not too dark to scare a nervous kid",
			"Double-lens anti-fog so they don't rip them off because they can't see",
		],
		bestFor:
			"Toddlers (ages 2-5) who need goggles that stay on, don't hurt, and don't fog up mid-lesson.",
	},
	"first-turns-harness": {
		agentSummary:
			"A padded harness with a rear handle and detachable leash that lets a parent " +
			"guide their toddler's first runs without bending over and destroying their back. " +
			"The handle is high enough to grab while standing upright. The quick-release buckle " +
			"means you can get it on over a snow suit in under 30 seconds.",
		useCaseTags: [
			"first ski runs",
			"parent-guided skiing",
			"bunny hill",
			"learn to ski",
			"ages 18mo-5yr",
		],
		highlights: [
			"Rear handle lets you guide your child while standing upright — saves your back",
			"Detachable 1.5m leash for when they're ready for a bit more independence",
			"Quick-release buckle goes on over a snow suit in 30 seconds",
			"Padded webbing — comfortable enough that toddlers don't fight wearing it",
		],
		bestFor:
			"Parents teaching a toddler to ski who want to stay upright and in control without hiring an instructor.",
	},
};
