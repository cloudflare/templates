/**
 * Types for Agent Commerce Analytics.
 *
 * Represents commerce-specific signals that don't exist in Cloudflare's
 * general-purpose analytics stack:
 *   - Which agents visited, what they searched for
 *   - Which products agents looked at vs. skipped
 *   - Which agent visits led to verified purchases
 *   - Whether the concise or full /llms.txt was sufficient
 *   - Agent journey timelines, demand signals, security metrics
 */

export interface Env {
	EVENT_STORE: KVNamespace;
	MERCHANT_NAME?: string;
	SEED_DEMO_DATA?: string;
	EVENT_RETENTION_DAYS?: string;
	/**
	 * Optional secret. When set (via `wrangler secret put ADMIN_TOKEN`),
	 * callers must pass its value in the `x-admin-token` header to use
	 * destructive endpoints like DELETE /api/events. When unset, those
	 * endpoints are disabled.
	 */
	ADMIN_TOKEN?: string;
}

/** A single agent interaction event. */
export interface AgentEvent {
	timestamp: string;
	/** Agent identity from cf-agent-id header (from a Managed Ruleset). */
	agentId: string | null;
	/** Agent name from cf-agent-name header. */
	agentName: string | null;
	/** Payment network from cf-agent-network header. */
	agentNetwork: string | null;
	/** Whether the agent was verified by the Managed Ruleset. */
	verified: boolean;
	/** What the agent did. */
	action: AgentAction;
	/** The endpoint hit. */
	path: string;
	/** Product slug if the action involved a specific product. */
	productSlug: string | null;
	/** Search/query terms if detectable. */
	searchQuery: string | null;
	/** HTTP status returned. */
	statusCode: number;
}

export type AgentAction =
	| "llms_txt_concise" // Read /llms.txt
	| "llms_txt_full" // Read /llms-full.txt (needed more detail)
	| "product_detail" // Read /api/products/:slug
	| "catalog_browse" // Read /api/products
	| "checkout_attempt" // Initiated checkout
	| "homepage"
	| "unknown";

/** Aggregated analytics for the merchant dashboard. */
export interface AgentAnalyticsSummary {
	period: string;
	merchantName: string;
	totalEvents: number;
	uniqueAgents: number;
	agentBreakdown: AgentProfile[];
	topProducts: ProductAnalytics[];
	funnel: FunnelMetrics;
	contentQuality: ContentQualityMetrics;
	topSearchQueries: Array<{ query: string; count: number }>;
	revenue: RevenueMetrics;
	agentJourneys: AgentJourney[];
	security: SecurityMetrics;
	demandSignals: DemandSignals;
	insights: Insight[];
}

export interface AgentProfile {
	agentId: string;
	agentName: string | null;
	network: string | null;
	verified: boolean;
	totalRequests: number;
	productsViewed: number;
	checkoutAttempts: number;
	successfulCheckouts: number;
	estimatedRevenue: number;
	lastSeen: string;
}

export interface ProductAnalytics {
	slug: string;
	name: string;
	price: number;
	detailViews: number;
	uniqueAgentViews: number;
	checkoutAttempts: number;
	successfulCheckouts: number;
	conversionRate: number;
	estimatedRevenue: number;
	viewedNotPurchased: string[];
}

export interface FunnelMetrics {
	discoveryReads: number;
	fullDetailReads: number;
	productDetailReads: number;
	checkoutAttempts: number;
	successfulCheckouts: number;
	blockedCheckouts: number;
	discoveryToFullRate: number;
	discoveryToProductRate: number;
	productToCheckoutRate: number;
	checkoutSuccessRate: number;
}

export interface ContentQualityMetrics {
	conciseOnlyRate: number;
	neededFullRate: number;
	directProductRate: number;
}

export interface RevenueMetrics {
	estimatedTotal: number;
	verifiedRevenue: number;
	unverifiedRevenue: number;
	verifiedCheckoutAttempts: number;
	unverifiedCheckoutAttempts: number;
	averageOrderValue: number;
	byNetwork: Record<string, NetworkMetrics>;
}

export interface NetworkMetrics {
	agents: number;
	checkoutAttempts: number;
	successfulCheckouts: number;
	estimatedRevenue: number;
	conversionRate: number;
}

export interface JourneyStep {
	timestamp: string;
	minutesAgo: number;
	action: AgentAction;
	description: string;
	productSlug: string | null;
	productName: string | null;
	searchQuery: string | null;
	statusCode: number;
}

export interface AgentJourney {
	agentId: string;
	agentName: string | null;
	network: string | null;
	verified: boolean;
	steps: JourneyStep[];
	journeySummary: string;
	sessionDurationMinutes: number;
	isReturnVisitor: boolean;
	itemsPurchased: number;
	estimatedSpend: number;
}

export interface SecurityMetrics {
	verifiedAgents: number;
	unverifiedAgents: number;
	verifiedRate: number;
	blockedCheckouts: number;
	totalCheckoutAttempts: number;
	checkoutBlockRate: number;
	unverifiedHighValueAttempts: SecurityEvent[];
}

export interface SecurityEvent {
	agentName: string;
	action: string;
	path: string;
	statusCode: number;
	timestamp: string;
}

export interface DemandSignals {
	convertedQueries: QueryOutcome[];
	browseOnlyQueries: QueryOutcome[];
	bouncedQueries: QueryOutcome[];
	unmatchedDemand: QueryOutcome[];
}

export interface QueryOutcome {
	query: string;
	agentName: string;
	outcome: "purchased" | "browsed" | "bounced" | "blocked" | "unmatched";
	itemsPurchased?: number;
	productsViewed?: string[];
}

export interface Insight {
	icon: string;
	label: string;
	text: string;
	priority: number;
}
