/**
 * x402-proxy Template - Bot Registry (Agent Reference Only)
 *
 * Used by AI agents during setup to resolve bot names to detection IDs.
 * NOT used at runtime - IDs are resolved during setup and stored in wrangler.jsonc.
 *
 * INCLUDED OPERATORS: Google, Microsoft, OpenAI, Anthropic, Perplexity, Meta
 *
 * For additional bots, find detection IDs in Cloudflare dashboard:
 * AI Crawl Control > Crawlers > Actions menu > Copy detection ID
 */

export interface BotEntry {
	name: string;
	operator: string;
	category: string;
	detectionIds: number[];
}

export const BOTS: Record<string, BotEntry> = {
	// =========================================================================
	// GOOGLE
	// =========================================================================
	Googlebot: {
		name: "Googlebot",
		operator: "Google",
		category: "Search Engine Crawler",
		detectionIds: [120623194, 33554459],
	},
	"Google-CloudVertexBot": {
		name: "Google-CloudVertexBot",
		operator: "Google",
		category: "AI Crawler",
		detectionIds: [133730073, 33564321],
	},

	// =========================================================================
	// MICROSOFT
	// =========================================================================
	BingBot: {
		name: "BingBot",
		operator: "Microsoft",
		category: "Search Engine Crawler",
		detectionIds: [117479730, 33554461],
	},

	// =========================================================================
	// OPENAI
	// =========================================================================
	GPTBot: {
		name: "GPTBot",
		operator: "OpenAI",
		category: "AI Crawler",
		detectionIds: [123815556, 33563875],
	},
	"ChatGPT agent": {
		name: "ChatGPT agent",
		operator: "OpenAI",
		category: "AI Assistant",
		detectionIds: [129220581],
	},
	"ChatGPT-User": {
		name: "ChatGPT-User",
		operator: "OpenAI",
		category: "AI Assistant",
		detectionIds: [132995013, 33563857],
	},
	"OAI-SearchBot": {
		name: "OAI-SearchBot",
		operator: "OpenAI",
		category: "AI Search",
		detectionIds: [126255384, 33563986],
	},

	// =========================================================================
	// ANTHROPIC
	// =========================================================================
	ClaudeBot: {
		name: "ClaudeBot",
		operator: "Anthropic",
		category: "AI Crawler",
		detectionIds: [33563859],
	},
	"Claude-SearchBot": {
		name: "Claude-SearchBot",
		operator: "Anthropic",
		category: "AI Search",
		detectionIds: [33564301],
	},
	"Claude-User": {
		name: "Claude-User",
		operator: "Anthropic",
		category: "AI Assistant",
		detectionIds: [33564303],
	},

	// =========================================================================
	// PERPLEXITY
	// =========================================================================
	PerplexityBot: {
		name: "PerplexityBot",
		operator: "Perplexity",
		category: "AI Search",
		detectionIds: [33563889],
	},
	"Perplexity-User": {
		name: "Perplexity-User",
		operator: "Perplexity",
		category: "AI Assistant",
		detectionIds: [33564371],
	},

	// =========================================================================
	// META
	// =========================================================================
	FacebookBot: {
		name: "FacebookBot",
		operator: "Meta",
		category: "AI Crawler",
		detectionIds: [33563972],
	},
	"Meta-ExternalAgent": {
		name: "Meta-ExternalAgent",
		operator: "Meta",
		category: "AI Crawler",
		detectionIds: [124581738, 33563982],
	},
	"Meta-ExternalFetcher": {
		name: "Meta-ExternalFetcher",
		operator: "Meta",
		category: "AI Assistant",
		detectionIds: [132272919, 33563980],
	},
};
