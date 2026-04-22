import { useEffect, useState } from "react";
import "./App.css";

// ---------------------------------------------------------------------------
// Types — duplicated from src/lib/types.ts so the SPA tsconfig doesn't need
// to reach into worker sources. Keep in sync with the Worker's JSON shape.
// ---------------------------------------------------------------------------

type AgentAction =
	| "llms_txt_concise"
	| "llms_txt_full"
	| "product_detail"
	| "catalog_browse"
	| "checkout_attempt"
	| "homepage"
	| "unknown";

interface AgentProfile {
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

interface ProductAnalytics {
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

interface FunnelMetrics {
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

interface RevenueMetrics {
	estimatedTotal: number;
	verifiedRevenue: number;
	unverifiedRevenue: number;
	verifiedCheckoutAttempts: number;
	unverifiedCheckoutAttempts: number;
	averageOrderValue: number;
	byNetwork: Record<
		string,
		{
			agents: number;
			checkoutAttempts: number;
			successfulCheckouts: number;
			estimatedRevenue: number;
			conversionRate: number;
		}
	>;
}

interface SecurityMetrics {
	verifiedAgents: number;
	unverifiedAgents: number;
	verifiedRate: number;
	blockedCheckouts: number;
	totalCheckoutAttempts: number;
	checkoutBlockRate: number;
}

interface JourneyStep {
	action: AgentAction;
	description: string;
	minutesAgo: number;
	statusCode: number;
}

interface AgentJourney {
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

interface Insight {
	icon: string;
	label: string;
	text: string;
	priority: number;
}

interface Summary {
	period: string;
	merchantName: string;
	totalEvents: number;
	uniqueAgents: number;
	agentBreakdown: AgentProfile[];
	topProducts: ProductAnalytics[];
	funnel: FunnelMetrics;
	revenue: RevenueMetrics;
	security: SecurityMetrics;
	agentJourneys: AgentJourney[];
	insights: Insight[];
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

function App() {
	const [summary, setSummary] = useState<Summary | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			setLoading(true);
			setError(null);
			try {
				const res = await fetch("/api/dashboard");
				if (!res.ok) {
					throw new Error(`API error: ${res.status}`);
				}
				const json = (await res.json()) as Summary;
				if (!cancelled) setSummary(json);
			} catch (err) {
				if (!cancelled)
					setError(err instanceof Error ? err.message : "Unknown error");
			} finally {
				if (!cancelled) setLoading(false);
			}
		}
		load();
		return () => {
			cancelled = true;
		};
	}, []);

	return (
		<div className="page">
			<header className="topbar">
				<div className="brand">
					<span className="brand-title">Agent Commerce Analytics</span>
					<span className="merchant-name">
						{summary?.merchantName ?? "Loading…"}
					</span>
				</div>
				<div className="badges">
					<span className="badge workers">Workers</span>
					<span className="badge kv">KV</span>
				</div>
			</header>

			<main className="main">
				{loading && (
					<div className="state">
						<h2>Loading dashboard…</h2>
						<p>Reading agent events from KV.</p>
					</div>
				)}

				{error && (
					<div className="state">
						<h2 className="error">Could not load dashboard</h2>
						<p>{error}</p>
					</div>
				)}

				{summary && !loading && !error && <Dashboard summary={summary} />}
			</main>

			<footer className="footer">
				Data persisted in <code>EVENT_STORE</code> (KV). Post events to{" "}
				<code>/api/events/from-headers</code> from your Managed Ruleset or
				origin Worker to feed this dashboard with real traffic.
			</footer>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

function Dashboard({ summary }: { summary: Summary }) {
	const purchasingAgents = summary.agentBreakdown.filter(
		(a) => a.successfulCheckouts > 0,
	).length;

	return (
		<div>
			{/* Headline cards */}
			<div className="headline-grid">
				<HeadlineCard
					label="Agent revenue"
					value={formatCurrency(summary.revenue.estimatedTotal)}
					hint={`${purchasingAgents} purchasing agent${purchasingAgents === 1 ? "" : "s"}`}
					revenue
				/>
				<HeadlineCard
					label="Unique agents"
					value={String(summary.uniqueAgents)}
					hint={`${summary.totalEvents} total requests`}
				/>
				<HeadlineCard
					label="Verified agents"
					value={`${summary.security.verifiedAgents} / ${summary.security.verifiedAgents + summary.security.unverifiedAgents}`}
					hint={`${formatPercent(summary.security.verifiedRate)} verified`}
				/>
				<HeadlineCard
					label="Blocked at checkout"
					value={String(summary.security.blockedCheckouts)}
					hint={
						summary.security.totalCheckoutAttempts > 0
							? `${formatPercent(summary.security.checkoutBlockRate)} block rate`
							: "No checkout attempts yet"
					}
				/>
			</div>

			{/* Insights */}
			{summary.insights.length > 0 && (
				<section className="section">
					<div className="section-header">
						<h2>Insights</h2>
						<span className="sub">
							Auto-generated headlines computed from events
						</span>
					</div>
					<div className="insight-list">
						{summary.insights.map((ins, i) => (
							<div key={i} className={`insight ${ins.icon}`}>
								<div className="label">{ins.label}</div>
								<div className="text">{ins.text}</div>
							</div>
						))}
					</div>
				</section>
			)}

			{/* Funnel */}
			<section className="section">
				<div className="section-header">
					<h2>Discovery funnel</h2>
					<span className="sub">
						llms.txt reads → product views → checkout outcomes
					</span>
				</div>
				<Funnel funnel={summary.funnel} />
			</section>

			{/* Agents */}
			<section className="section">
				<div className="section-header">
					<h2>Agents</h2>
					<span className="sub">Per-agent activity with estimated spend</span>
				</div>
				<AgentTable agents={summary.agentBreakdown} />
			</section>

			{/* Journeys */}
			{summary.agentJourneys.length > 0 && (
				<section className="section">
					<div className="section-header">
						<h2>Agent journeys</h2>
						<span className="sub">
							Session-reconstructed timelines with return-visit detection
						</span>
					</div>
					{summary.agentJourneys.map((j) => (
						<JourneyCard key={j.agentId} journey={j} />
					))}
				</section>
			)}

			{/* Products */}
			{summary.topProducts.length > 0 && (
				<section className="section">
					<div className="section-header">
						<h2>Product performance</h2>
						<span className="sub">
							Views, conversions, and revenue per product
						</span>
					</div>
					<ProductTable products={summary.topProducts} />
				</section>
			)}

			{/* Before / after comparison */}
			<section className="section">
				<div className="section-header">
					<h2>What this unlocks</h2>
					<span className="sub">
						Generic zone analytics vs. commerce-aware analytics
					</span>
				</div>
				<BeforeAfter summary={summary} purchasingAgents={purchasingAgents} />
			</section>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function HeadlineCard({
	label,
	value,
	hint,
	revenue,
}: {
	label: string;
	value: string;
	hint?: string;
	revenue?: boolean;
}) {
	return (
		<div className={`headline-card ${revenue ? "revenue" : ""}`}>
			<div className="label">{label}</div>
			<div className="value">{value}</div>
			{hint && <div className="hint">{hint}</div>}
		</div>
	);
}

function Funnel({ funnel }: { funnel: FunnelMetrics }) {
	const max = Math.max(
		funnel.discoveryReads,
		funnel.productDetailReads,
		funnel.checkoutAttempts,
		1,
	);

	const rows: Array<{
		label: string;
		value: number;
		rate?: string;
		variant?: "blocked" | "success";
	}> = [
		{ label: "Discovery (/llms.txt)", value: funnel.discoveryReads },
		{
			label: "Needed full detail",
			value: funnel.fullDetailReads,
			rate: `${formatPercent(funnel.discoveryToFullRate)} of discovery`,
		},
		{
			label: "Product views",
			value: funnel.productDetailReads,
			rate: `${formatPercent(funnel.discoveryToProductRate)} of discovery`,
		},
		{
			label: "Checkout attempts",
			value: funnel.checkoutAttempts,
			rate: `${formatPercent(funnel.productToCheckoutRate)} of views`,
		},
		{
			label: "Successful checkouts",
			value: funnel.successfulCheckouts,
			rate: `${formatPercent(funnel.checkoutSuccessRate)} success`,
			variant: "success",
		},
	];
	if (funnel.blockedCheckouts > 0) {
		rows.push({
			label: "Blocked (unverified)",
			value: funnel.blockedCheckouts,
			variant: "blocked",
		});
	}

	return (
		<div>
			{rows.map((r) => {
				const pct = (r.value / max) * 100;
				return (
					<div className="funnel-row" key={r.label}>
						<div className="funnel-label">{r.label}</div>
						<div className="funnel-bar-container">
							<div
								className={`funnel-bar ${r.variant ?? ""}`}
								style={{ width: `${Math.max(pct, r.value > 0 ? 4 : 0)}%` }}
							/>
						</div>
						<div className="funnel-value">
							{r.value}
							{r.rate && <span className="rate">({r.rate})</span>}
						</div>
					</div>
				);
			})}
		</div>
	);
}

function AgentTable({ agents }: { agents: AgentProfile[] }) {
	if (agents.length === 0) {
		return <div className="state">No agent traffic yet.</div>;
	}
	return (
		<div className="table-scroll">
			<table className="agent-table">
				<thead>
					<tr>
						<th>Agent</th>
						<th>Network</th>
						<th>Status</th>
						<th className="numeric">Requests</th>
						<th className="numeric">Products viewed</th>
						<th className="numeric">Checkouts</th>
						<th className="numeric">Est. revenue</th>
					</tr>
				</thead>
				<tbody>
					{agents.map((a) => (
						<tr key={a.agentId}>
							<td>{a.agentName ?? a.agentId}</td>
							<td>{a.network ?? "—"}</td>
							<td>
								<span
									className={`status-pill ${a.verified ? "verified" : "unverified"}`}
								>
									{a.verified ? "Verified" : "Unverified"}
								</span>
							</td>
							<td className="numeric">{a.totalRequests}</td>
							<td className="numeric">{a.productsViewed}</td>
							<td className="numeric">
								{a.successfulCheckouts}
								{a.checkoutAttempts > a.successfulCheckouts && (
									<span style={{ color: "#dc2626" }}>
										{" "}
										(+{a.checkoutAttempts - a.successfulCheckouts} blocked)
									</span>
								)}
							</td>
							<td className="numeric">
								{a.estimatedRevenue > 0 ? (
									<span className="revenue-value">
										{formatCurrency(a.estimatedRevenue)}
									</span>
								) : (
									"—"
								)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function JourneyCard({ journey }: { journey: AgentJourney }) {
	return (
		<div className="journey-card">
			<div className="journey-header">
				<div>
					<div className="journey-name">
						{journey.agentName ?? journey.agentId}
					</div>
					<div className="journey-summary">{journey.journeySummary}</div>
				</div>
				<div className="journey-meta">
					<span
						className={`status-pill ${journey.verified ? "verified" : "unverified"}`}
					>
						{journey.verified ? (journey.network ?? "verified") : "unverified"}
					</span>
					{journey.estimatedSpend > 0 && (
						<span className="spend">
							{formatCurrency(journey.estimatedSpend)}
						</span>
					)}
					{journey.isReturnVisitor && <span>Return visitor</span>}
				</div>
			</div>
			<div className="journey-steps">
				{journey.steps.map((step, i) => {
					const kind = stepKind(step);
					return (
						<div key={i} className="journey-step">
							<span className="time">{formatMinutesAgo(step.minutesAgo)}</span>
							<span className={`icon ${kind}`}>{stepGlyph(kind)}</span>
							<span className="desc">{step.description}</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function ProductTable({ products }: { products: ProductAnalytics[] }) {
	return (
		<div className="table-scroll">
			<table className="product-table">
				<thead>
					<tr>
						<th>Product</th>
						<th className="numeric">Price</th>
						<th className="numeric">Views</th>
						<th className="numeric">Unique agents</th>
						<th className="numeric">Checkouts</th>
						<th className="numeric">Conversion</th>
						<th className="numeric">Est. revenue</th>
					</tr>
				</thead>
				<tbody>
					{products.map((p) => (
						<tr key={p.slug}>
							<td>{p.name}</td>
							<td className="numeric">{formatCurrency(p.price)}</td>
							<td className="numeric">{p.detailViews}</td>
							<td className="numeric">{p.uniqueAgentViews}</td>
							<td className="numeric">{p.successfulCheckouts}</td>
							<td className="numeric">{formatPercent(p.conversionRate)}</td>
							<td className="numeric">
								{p.estimatedRevenue > 0 ? (
									<span className="revenue-value">
										{formatCurrency(p.estimatedRevenue)}
									</span>
								) : (
									"—"
								)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function BeforeAfter({
	summary,
	purchasingAgents,
}: {
	summary: Summary;
	purchasingAgents: number;
}) {
	const topAgent = summary.agentBreakdown.find((a) => a.estimatedRevenue > 0);
	const topProduct = summary.topProducts[0];

	// "Before" column = the signals a merchant would already see in Zone
	// Analytics / raw HTTP logs, generated from raw counts so this column
	// stays populated even when there's very little activity.
	const beforeLines: string[] = [
		`${summary.totalEvents} requests flagged as likely-bot`,
		`${summary.funnel.discoveryReads} hits on /llms.txt`,
	];
	if (topProduct) {
		beforeLines.push(
			`/api/products/${topProduct.slug} hit ${topProduct.detailViews}×`,
		);
	}
	if (summary.security.blockedCheckouts > 0) {
		beforeLines.push(
			`${summary.security.blockedCheckouts} × 403 on /api/checkout`,
		);
	}

	// "After" column = what the commerce-aware layer infers from the same events.
	const afterLines: string[] = [
		`${summary.uniqueAgents} distinct agents, ${purchasingAgents} purchased ${formatCurrency(summary.revenue.estimatedTotal)}`,
	];
	if (topAgent) {
		afterLines.push(
			`${topAgent.agentName ?? topAgent.agentId} (${topAgent.network ?? "unverified"}) bought ${topAgent.successfulCheckouts} item${topAgent.successfulCheckouts === 1 ? "" : "s"}`,
		);
	}
	if (topProduct) {
		afterLines.push(
			`${formatPercent(topProduct.conversionRate)} agent conversion on ${topProduct.name}`,
		);
	}
	if (summary.security.blockedCheckouts > 0) {
		afterLines.push("Unverified agents blocked before payment — no leak");
	}

	return (
		<div className="compare-grid">
			<div className="compare-col before">
				<h3>Cloudflare analytics today</h3>
				<div className="value">
					{beforeLines.map((l, i) => (
						<div key={i}>"{l}"</div>
					))}
				</div>
			</div>
			<div className="compare-col">
				<h3>This dashboard</h3>
				<div className="value">
					{afterLines.map((l, i) => (
						<div key={i}>"{l}"</div>
					))}
				</div>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: number): string {
	try {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: "USD",
		}).format(amount);
	} catch {
		return `$${amount.toFixed(2)}`;
	}
}

function formatPercent(rate: number): string {
	return `${(rate * 100).toFixed(1)}%`;
}

function formatMinutesAgo(m: number): string {
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	const rem = m % 60;
	return rem === 0 ? `${h}h ago` : `${h}h${String(rem).padStart(2, "0")}m`;
}

function stepKind(
	step: JourneyStep,
): "discover" | "view" | "buy" | "blocked" | "" {
	if (step.statusCode === 403) return "blocked";
	if (step.action === "llms_txt_concise" || step.action === "llms_txt_full")
		return "discover";
	if (step.action === "product_detail") return "view";
	if (step.action === "checkout_attempt") return "buy";
	return "";
}

function stepGlyph(kind: string): string {
	switch (kind) {
		case "discover":
			return "\u2315"; // ⌕ looking glass
		case "view":
			return "\u25CE"; // ◎ bullseye
		case "buy":
			return "\u2713"; // ✓ check
		case "blocked":
			return "\u2715"; // ✕ cross
		default:
			return "\u2022"; // • bullet
	}
}

export default App;
