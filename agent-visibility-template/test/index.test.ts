import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, it, expect } from "vitest";
import { ENRICHED_KEY } from "../src/lib/store";
import type { Resource } from "../src/lib/types";

const BASE = "https://example.com";

// Seed the enriched cache so the surfaces serve from KV instead of calling
// Workers AI on every request. This keeps the suite fast and avoids incurring
// AI usage charges during tests. (Per review feedback on #968.)
const SEEDED: Resource[] = [
	{
		slug: "getting-started",
		url: "https://example.com/docs/getting-started",
		title: "Getting Started with Acme",
		summary: "How to create your first workflow with Acme in five minutes.",
		keyPoints: ["Install the CLI", "Workflows are YAML"],
		topics: ["onboarding", "cli"],
		category: "documentation",
		content: "# Getting Started\n\nInstall the CLI and deploy a workflow.",
		updatedAt: "2026-01-01T00:00:00.000Z",
		model: "seed",
	},
	{
		slug: "pricing",
		url: "https://example.com/pricing",
		title: "Pricing",
		summary: "Acme has Free, Pro, and Enterprise plans.",
		keyPoints: ["Free $0", "Pro $20/mo"],
		topics: ["pricing", "plans"],
		category: "pricing",
		content: "# Pricing\n\nFree, Pro, and Enterprise.",
		updatedAt: "2026-01-01T00:00:00.000Z",
		model: "seed",
	},
];

beforeAll(async () => {
	await env.VISIBILITY_CACHE.put(ENRICHED_KEY, JSON.stringify(SEEDED));
});

describe("Agent Visibility template", () => {
	it("serves /llms.txt as plain text with a Content-Signal header", async () => {
		const res = await SELF.fetch(`${BASE}/llms.txt`);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/plain");
		expect(res.headers.get("content-signal")).toContain("ai-input=yes");
		const text = await res.text();
		expect(text).toContain("# ");
		expect(text).toContain("## Pages");
		// Links point at the per-page Markdown surface.
		expect(text).toContain(".md)");
	});

	it("serves /llms-full.txt with inlined page content", async () => {
		const res = await SELF.fetch(`${BASE}/llms-full.txt`);
		expect(res.status).toBe(200);
		const text = await res.text();
		expect(text).toContain("## Content");
		expect(text).toContain("## Source");
	});

	it("serves /index.json as a typed index over the same store", async () => {
		const res = await SELF.fetch(`${BASE}/index.json`);
		expect(res.status).toBe(200);
		const json = (await res.json()) as {
			protocol: string;
			surfaces: Record<string, string>;
			pages: Array<{ slug: string; title: string; sources: unknown }>;
		};
		expect(json.protocol).toContain("agent-visibility");
		expect(json.surfaces).toHaveProperty("llmsTxt");
		expect(json.pages.length).toBeGreaterThan(0);
		expect(json.pages[0]).toHaveProperty("sources");
	});

	it("serves a per-page Markdown surface at /:slug.md", async () => {
		const res = await SELF.fetch(`${BASE}/getting-started.md`);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/markdown");
		const text = await res.text();
		expect(text).toContain("# ");
		expect(text).toContain("## Source");
	});

	it("404s for an unknown page Markdown slug", async () => {
		const res = await SELF.fetch(`${BASE}/does-not-exist.md`);
		expect(res.status).toBe(404);
	});

	it("serves robots.txt that welcomes known AI agents with a Content-Signal", async () => {
		const res = await SELF.fetch(`${BASE}/robots.txt`);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-signal")).toContain("ai-input=yes");
		const text = await res.text();
		expect(text).toContain("User-agent: GPTBot");
		expect(text).toContain("llms.txt");
		// Content-Signal must live inside robots.txt (the canonical location),
		// not only in an HTTP header.
		expect(text).toContain("Content-Signal: ai-input=yes");
	});

	it("sets CORS headers on the per-page Markdown surface", async () => {
		const res = await SELF.fetch(`${BASE}/getting-started.md`);
		expect(res.headers.get("access-control-allow-origin")).toBe("*");
	});

	it("serves site-level JSON-LD at /jsonld", async () => {
		const res = await SELF.fetch(`${BASE}/jsonld`);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("application/ld+json");
		const json = (await res.json()) as Record<string, unknown>;
		expect(json["@context"]).toBe("https://schema.org");
		expect(json["@type"]).toBe("WebSite");
	});

	it("serves per-page JSON-LD at /:slug.jsonld", async () => {
		const res = await SELF.fetch(`${BASE}/pricing.jsonld`);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("application/ld+json");
		const json = (await res.json()) as Record<string, unknown>;
		expect(json["@type"]).toBe("Article");
	});

	it("lists surfaces and resources through the API", async () => {
		const site = await SELF.fetch(`${BASE}/api/site`);
		expect(site.status).toBe(200);
		const siteJson = (await site.json()) as { surfaces: unknown[] };
		expect(siteJson.surfaces.length).toBeGreaterThanOrEqual(5);

		const list = await SELF.fetch(`${BASE}/api/resources`);
		const listJson = (await list.json()) as { count: number };
		expect(listJson.count).toBeGreaterThan(0);
	});

	it("rejects unauthenticated writes to /api/resources", async () => {
		const res = await SELF.fetch(`${BASE}/api/resources`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ slug: "x", body: "hi" }),
		});
		expect(res.status).toBe(401);
	});

	it("rejects unauthenticated refresh requests", async () => {
		const res = await SELF.fetch(`${BASE}/api/refresh`, { method: "POST" });
		expect(res.status).toBe(401);
		const json = (await res.json()) as { error: string };
		expect(json.error).toContain("Unauthorized");
	});

	it("rejects an invalid slug even when authenticated", async () => {
		const res = await SELF.fetch(`${BASE}/api/resources`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: "Bearer test-token",
			},
			body: JSON.stringify({ slug: "Not A Slug!", body: "hi" }),
		});
		expect(res.status).toBe(400);
	});

	it("accepts an authenticated POST and exposes it on surfaces", async () => {
		const res = await SELF.fetch(`${BASE}/api/resources`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: "Bearer test-token",
			},
			body: JSON.stringify({
				slug: "changelog",
				url: "https://example.com/changelog",
				title: "Changelog",
				body: "# Changelog\n\nv2.0 adds workflow templates and a public API.",
			}),
		});
		expect(res.status).toBe(201);
		const created = (await res.json()) as { slug: string };
		expect(created.slug).toBe("changelog");

		const md = await SELF.fetch(`${BASE}/changelog.md`);
		expect(md.status).toBe(200);
	});

	it("accepts authenticated refresh requests and clears the enriched cache", async () => {
		await env.VISIBILITY_CACHE.put(ENRICHED_KEY, JSON.stringify(SEEDED));

		const res = await SELF.fetch(`${BASE}/api/refresh`, {
			method: "POST",
			headers: { authorization: "Bearer test-token" },
		});
		expect(res.status).toBe(200);
		const json = (await res.json()) as { ok: boolean; message: string };
		expect(json.ok).toBe(true);
		expect(json.message).toContain("Cache cleared");
		expect(await env.VISIBILITY_CACHE.get(ENRICHED_KEY)).toBeNull();
	});

	it("keeps the Web Bot Auth identity surface disabled by default", async () => {
		const dir = await SELF.fetch(`${BASE}/.well-known/web-bot-auth/directory`);
		expect(dir.status).toBe(404);
	});
});
