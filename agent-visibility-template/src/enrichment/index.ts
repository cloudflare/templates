/**
 * Workers AI enrichment.
 *
 * Turns a raw page (HTML or Markdown/plain text) into a structured `Resource`:
 * a clean title, an agent-friendly summary, key points, topic tags, and a
 * tidy Markdown body. This structured record is what every agent surface is
 * rendered from.
 */
import type { RawResource, Resource } from "../lib/types";

const MAX_INPUT_BYTES = 60_000;

/**
 * Trim source content to a model-feedable window. Strips script/style/svg and
 * HTML comments, collapses whitespace, and truncates as a last resort.
 */
export function trimContent(input: string): string {
	let s = input;
	s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
	s = s.replace(/<style[\s\S]*?<\/style>/gi, "");
	s = s.replace(/<svg[\s\S]*?<\/svg>/gi, "");
	s = s.replace(/<!--[\s\S]*?-->/g, "");
	s = s.replace(/<[^>]+>/g, " "); // drop remaining tags but keep text
	s = s.replace(/\s+/g, " ").trim();
	if (s.length > MAX_INPUT_BYTES) s = s.slice(0, MAX_INPUT_BYTES);
	return s;
}

const SYSTEM_PROMPT = `You prepare web content to be read by AI agents and assistants. The user pastes the raw text of one page. Return STRICT JSON only — no prose, no Markdown fences.

Schema:
{
  "title": string,            // concise page title
  "summary": string,          // 2-4 sentences, plain language, what the page is about and who it's for
  "keyPoints": string[],      // 3-6 short bullet phrases capturing the most important facts
  "topics": string[],         // up to 8 lowercase topic/keyword tags
  "category": string | null,  // one best-fit category label (e.g. "documentation", "pricing", "policy")
  "content": string           // a clean Markdown rewrite of the page body, faithful to the source, no invented facts
}

Rules:
- Use only information present in the input. Never invent facts, prices, or features.
- Keep "content" faithful and well-structured (headings, bullets) but trimmed of navigation/boilerplate.
- Output ONLY the JSON object.`;

interface AiResult {
	response?: unknown;
}

function asString(v: unknown): string {
	if (typeof v === "string") return v;
	if (v == null) return "";
	try {
		return JSON.stringify(v);
	} catch {
		return String(v);
	}
}

function parseJsonLoose(s: string): Record<string, unknown> {
	try {
		return JSON.parse(s) as Record<string, unknown>;
	} catch {
		const start = s.indexOf("{");
		const end = s.lastIndexOf("}");
		if (start === -1 || end === -1 || end <= start) return {};
		try {
			return JSON.parse(s.slice(start, end + 1)) as Record<string, unknown>;
		} catch {
			return {};
		}
	}
}

function stringArray(v: unknown, max: number): string[] {
	if (!Array.isArray(v)) return [];
	return v.filter((x): x is string => typeof x === "string").slice(0, max);
}

/**
 * Enrich a single raw resource into a structured `Resource`.
 *
 * On any model/parse failure, falls back to a deterministic enrichment built
 * from the raw text so the template never serves an empty surface.
 */
export async function enrichResource(
	ai: Ai,
	model: string,
	raw: RawResource,
): Promise<Resource> {
	const trimmed = trimContent(raw.body);

	try {
		const res = (await ai.run(model as keyof AiModels, {
			messages: [
				{ role: "system", content: SYSTEM_PROMPT },
				{ role: "user", content: trimmed },
			],
			max_tokens: 1200,
		})) as AiResult;

		const parsed =
			res?.response && typeof res.response === "object"
				? (res.response as Record<string, unknown>)
				: parseJsonLoose(asString(res?.response).trim());

		const title =
			(typeof parsed.title === "string" && parsed.title.trim()) ||
			raw.title ||
			deriveTitle(trimmed, raw.slug);

		return {
			slug: raw.slug,
			url: raw.url,
			title,
			summary:
				(typeof parsed.summary === "string" && parsed.summary.trim()) ||
				firstSentences(trimmed, 2),
			keyPoints: stringArray(parsed.keyPoints, 6),
			topics: stringArray(parsed.topics, 8).map((t) => t.toLowerCase()),
			category: typeof parsed.category === "string" ? parsed.category : null,
			content:
				(typeof parsed.content === "string" && parsed.content.trim()) ||
				trimmed,
			updatedAt: new Date().toISOString(),
			model,
		};
	} catch {
		return fallbackEnrichment(raw, model);
	}
}

/** Enrich many resources, tolerating individual failures. */
export async function enrichAll(
	ai: Ai,
	model: string,
	raws: RawResource[],
): Promise<Resource[]> {
	const out: Resource[] = [];
	for (const raw of raws) {
		out.push(await enrichResource(ai, model, raw));
	}
	return out;
}

/** Deterministic enrichment used when the model is unavailable. */
export function fallbackEnrichment(raw: RawResource, model: string): Resource {
	const trimmed = trimContent(raw.body);
	return {
		slug: raw.slug,
		url: raw.url,
		title: raw.title || deriveTitle(trimmed, raw.slug),
		summary: firstSentences(trimmed, 2),
		keyPoints: [],
		topics: [],
		category: null,
		content: trimmed,
		updatedAt: new Date().toISOString(),
		model: `${model} (fallback)`,
	};
}

function deriveTitle(text: string, slug: string): string {
	const firstLine = text.split(/[.\n]/)[0]?.trim();
	if (firstLine && firstLine.length <= 80) return firstLine;
	return slug
		.split(/[-_]/)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");
}

function firstSentences(text: string, n: number): string {
	const sentences = text.split(/(?<=[.!?])\s+/).slice(0, n);
	return sentences.join(" ").trim();
}
