/**
 * Project the one enriched `Resource[]` store onto every agent-discovery
 * surface. The whole point of the template lives here: the underlying data is
 * identical; each function just renders it in the convention a given agent or
 * crawler prefers.
 *
 *   renderLlmsTxt        -> /llms.txt          (llms.txt index convention)
 *   renderLlmsFullTxt    -> /llms-full.txt     (full inlined content)
 *   renderIndexJson      -> /index.json        (typed JSON index)
 *   renderResourceMd     -> /<slug>.md         (per-page groundable Markdown)
 *   renderRobotsTxt      -> /robots.txt        (explicit AI-bot directives)
 *   renderWebsiteJsonLd  -> JSON-LD            (schema.org, embedded in HTML)
 *   renderResourceJsonLd -> JSON-LD            (schema.org per page)
 */
import type { Resource, SiteConfig } from "../lib/types";

export interface RenderCtx {
	site: SiteConfig;
	resources: Resource[];
	/** Content-Signal policy value, e.g. "ai-input=yes, search=yes, ai-train=no". */
	contentSignal?: string;
}

export const INDEX_PROTOCOL = "agent-visibility/0.1";

/** AI crawlers we explicitly welcome in robots.txt. */
export const KNOWN_AI_AGENTS = [
	"GPTBot",
	"OAI-SearchBot",
	"ChatGPT-User",
	"ClaudeBot",
	"Claude-User",
	"PerplexityBot",
	"Google-Extended",
	"Applebot-Extended",
	"Bytespider",
	"CCBot",
];

function mdLink(text: string, href: string): string {
	return `[${text}](${href})`;
}

// ---------------------------------------------------------------------------
// /llms.txt — short Markdown index per the llms.txt convention.
// ---------------------------------------------------------------------------
export function renderLlmsTxt(ctx: RenderCtx): string {
	const { site, resources } = ctx;
	const lines: string[] = [];
	lines.push(`# ${site.name}`);
	lines.push("");
	lines.push(`> ${site.description}`);
	lines.push("");
	lines.push("Other machine-readable surfaces for this site:");
	lines.push(`- ${mdLink("Full content", `${site.origin}/llms-full.txt`)}`);
	lines.push(`- ${mdLink("Typed JSON index", `${site.origin}/index.json`)}`);
	lines.push("");
	lines.push("## Pages");
	lines.push("");
	for (const r of resources) {
		const summary = r.summary ? ` — ${firstSentence(r.summary)}` : "";
		lines.push(`- ${mdLink(r.title, `${site.origin}/${r.slug}.md`)}${summary}`);
	}
	lines.push("");
	return lines.join("\n");
}

// ---------------------------------------------------------------------------
// /llms-full.txt — every page's full Markdown inlined.
// ---------------------------------------------------------------------------
export function renderLlmsFullTxt(ctx: RenderCtx): string {
	const { site, resources } = ctx;
	const lines: string[] = [];
	lines.push(`# ${site.name}`);
	lines.push("");
	lines.push(`> ${site.description}`);
	lines.push("");
	for (const r of resources) {
		lines.push(renderResourceMd({ resource: r, site }));
		lines.push("");
		lines.push("---");
		lines.push("");
	}
	return lines.join("\n");
}

// ---------------------------------------------------------------------------
// /index.json — typed JSON index, the structured-agent surface.
// ---------------------------------------------------------------------------
export function renderIndexJson(ctx: RenderCtx) {
	const { site, resources } = ctx;
	return {
		protocol: INDEX_PROTOCOL,
		site: { name: site.name, description: site.description },
		// Derived from the latest content update (not wall-clock) so identical
		// content yields identical output — ETag/cache friendly.
		generatedAt: latestUpdatedAt(resources),
		surfaces: {
			llmsTxt: `${site.origin}/llms.txt`,
			llmsFullTxt: `${site.origin}/llms-full.txt`,
			json: `${site.origin}/index.json`,
			pageMarkdown: `${site.origin}/{slug}.md`,
			robots: `${site.origin}/robots.txt`,
		},
		pages: resources.map((r) => ({
			slug: r.slug,
			url: r.url,
			title: r.title,
			summary: r.summary,
			keyPoints: r.keyPoints,
			topics: r.topics,
			category: r.category,
			updatedAt: r.updatedAt,
			sources: {
				markdown: `${site.origin}/${r.slug}.md`,
				canonical: r.url,
			},
		})),
	};
}

// ---------------------------------------------------------------------------
// /<slug>.md — per-page Markdown, ideal for grounding/citation.
// ---------------------------------------------------------------------------
export function renderResourceMd(args: {
	resource: Resource;
	site: SiteConfig;
}): string {
	const r = args.resource;
	const lines: string[] = [];
	lines.push(`# ${r.title}`);
	lines.push("");
	if (r.category) lines.push(`*Category: ${r.category}*`);
	if (r.topics.length) lines.push(`*Topics: ${r.topics.join(", ")}*`);
	if (r.category || r.topics.length) lines.push("");
	if (r.summary) {
		lines.push(r.summary);
		lines.push("");
	}
	if (r.keyPoints.length) {
		lines.push("## Key points");
		lines.push("");
		for (const k of r.keyPoints) lines.push(`- ${k}`);
		lines.push("");
	}
	if (r.content) {
		lines.push("## Content");
		lines.push("");
		lines.push(r.content);
		lines.push("");
	}
	lines.push("## Source");
	lines.push("");
	lines.push(`- Canonical URL: ${r.url}`);
	lines.push(`- Typed record: ${args.site.origin}/index.json`);
	lines.push("");
	return lines.join("\n");
}

// ---------------------------------------------------------------------------
// /robots.txt — explicitly welcome AI agents and point them at llms.txt.
// ---------------------------------------------------------------------------
export function renderRobotsTxt(ctx: RenderCtx): string {
	const { site } = ctx;
	// Content Signals are expressed as a `Content-Signal:` directive inside a
	// robots.txt User-agent group (see https://contentsignals.org). We emit it
	// per group so the canonical place a crawler looks carries the policy.
	const signal = ctx.contentSignal;
	const lines: string[] = [];
	lines.push("# Robots directives for AI agents and crawlers.");
	lines.push("# This site intentionally welcomes AI agents — see /llms.txt.");
	lines.push("");
	for (const agent of KNOWN_AI_AGENTS) {
		lines.push(`User-agent: ${agent}`);
		lines.push("Allow: /");
		if (signal) lines.push(`Content-Signal: ${signal}`);
		lines.push("");
	}
	lines.push("User-agent: *");
	lines.push("Allow: /");
	if (signal) lines.push(`Content-Signal: ${signal}`);
	lines.push("");
	lines.push("# Machine-readable indexes for agents:");
	lines.push(`# - ${site.origin}/llms.txt`);
	lines.push(`# - ${site.origin}/index.json`);
	lines.push("");
	return lines.join("\n");
}

// ---------------------------------------------------------------------------
// JSON-LD (schema.org) — what classic + AI crawlers parse from HTML pages.
// ---------------------------------------------------------------------------
export function renderWebsiteJsonLd(ctx: RenderCtx): object {
	const { site, resources } = ctx;
	return {
		"@context": "https://schema.org",
		"@type": "WebSite",
		name: site.name,
		description: site.description,
		url: site.origin,
		mainEntity: {
			"@type": "ItemList",
			itemListElement: resources.map((r, i) => ({
				"@type": "ListItem",
				position: i + 1,
				url: `${site.origin}/${r.slug}.md`,
				name: r.title,
			})),
		},
	};
}

export function renderResourceJsonLd(args: {
	resource: Resource;
	site: SiteConfig;
}): object {
	const r = args.resource;
	return {
		"@context": "https://schema.org",
		"@type": "Article",
		headline: r.title,
		abstract: r.summary,
		keywords: r.topics.join(", "),
		articleSection: r.category ?? undefined,
		url: r.url,
		dateModified: r.updatedAt,
		isPartOf: {
			"@type": "WebSite",
			name: args.site.name,
			url: args.site.origin,
		},
	};
}

function firstSentence(text: string): string {
	return text.split(/(?<=[.!?])\s+/)[0]?.trim() ?? text;
}

/** Most recent `updatedAt` across resources (epoch start if empty). */
function latestUpdatedAt(resources: Resource[]): string {
	let latest = 0;
	for (const r of resources) {
		const t = Date.parse(r.updatedAt);
		if (Number.isFinite(t) && t > latest) latest = t;
	}
	return new Date(latest).toISOString();
}
