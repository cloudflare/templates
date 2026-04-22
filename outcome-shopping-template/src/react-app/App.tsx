import { useEffect, useState, type FormEvent } from "react";
import "./App.css";

// ---------------------------------------------------------------------------
// Types — duplicated from src/lib/types.ts so the SPA tsconfig doesn't need
// to reach into worker sources. Keep these in sync with the Worker shape.
// ---------------------------------------------------------------------------

interface ComponentNeed {
	need: string;
	priority: "essential" | "recommended" | "optional";
	searchTerms: string[];
}

interface SourcedProduct {
	slug: string;
	name: string;
	price: number;
	currency: string;
	category: string;
	merchantName: string;
	merchantUrl: string;
	agentSummary: string;
	useCaseTags: string[];
	bestFor: string;
}

interface Recommendation {
	need: string;
	priority: "essential" | "recommended" | "optional";
	product: SourcedProduct;
	reasoning: string;
	alternatives?: SourcedProduct[];
}

interface OutcomeResult {
	intent: string;
	decomposition: ComponentNeed[];
	decompositionFallback?: "ai_error" | "ai_empty";
	recommendations: Recommendation[];
	unfulfilledNeeds: ComponentNeed[];
	totalEstimatedCost: number;
	currency: string;
	merchantsUsed: string[];
	generatedAt: string;
	usingSampleData: boolean;
}

interface ApiErrorResponse {
	error: string;
}

// ---------------------------------------------------------------------------
// Examples — bundled so the template is useful the moment it loads
// ---------------------------------------------------------------------------

const EXAMPLES = [
	"outfit my 3-year-old for skiing",
	"beginner ski gear for a family of four",
	"warm winter gear for toddler snow play",
];

const LOADING_STEPS = [
	"Fetching merchant catalogs",
	"Decomposing your intent into component needs",
	"Matching products across merchants",
	"Assembling your recommendation",
];

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

function App() {
	const [intentInput, setIntentInput] = useState("");
	const [submittedIntent, setSubmittedIntent] = useState<string | null>(null);
	const [result, setResult] = useState<OutcomeResult | null>(null);
	const [loading, setLoading] = useState(false);
	const [loadingStep, setLoadingStep] = useState(0);
	const [error, setError] = useState<string | null>(null);

	// Animate the loading steps. Purely cosmetic — the real work runs in the
	// Worker — but it signals the pipeline to the user while they wait.
	useEffect(() => {
		if (!loading) {
			setLoadingStep(0);
			return;
		}
		const interval = setInterval(() => {
			setLoadingStep((s) => (s < LOADING_STEPS.length - 1 ? s + 1 : s));
		}, 1500);
		return () => clearInterval(interval);
	}, [loading]);

	async function runShop(intent: string) {
		setSubmittedIntent(intent);
		setResult(null);
		setError(null);
		setLoading(true);
		try {
			const res = await fetch(`/api/shop?q=${encodeURIComponent(intent)}`);
			if (!res.ok) {
				const errJson = (await res
					.json()
					.catch(() => ({ error: "Request failed" }))) as ApiErrorResponse;
				throw new Error(errJson.error || `HTTP ${res.status}`);
			}
			const json = (await res.json()) as OutcomeResult;
			setResult(json);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setLoading(false);
		}
	}

	function onSubmit(event: FormEvent) {
		event.preventDefault();
		const trimmed = intentInput.trim();
		if (!trimmed) return;
		void runShop(trimmed);
	}

	function onExampleClick(example: string) {
		setIntentInput(example);
		void runShop(example);
	}

	return (
		<div className="page">
			<header className="hero">
				<div className="hero-inner">
					<div className="badges">
						<span className="badge workers">Workers</span>
						<span className="badge ai">Workers AI</span>
						<span className="badge kv">KV Cache</span>
					</div>
					<h1>Outcome Shopping</h1>
					<p>
						Describe what you want to achieve. The orchestrator decomposes your
						intent into component needs, searches across every registered
						merchant&rsquo;s <code>/api/products</code>, and composes a
						cross-merchant recommendation — with alternatives, total cost, and a
						note on anything no merchant carries.
					</p>

					<form className="intent-form" onSubmit={onSubmit}>
						<input
							type="text"
							className="intent-input"
							placeholder="e.g., outfit my 3-year-old for skiing"
							value={intentInput}
							onChange={(e) => setIntentInput(e.target.value)}
							disabled={loading}
							aria-label="Shopping intent"
						/>
						<button
							className="intent-submit"
							type="submit"
							disabled={loading || !intentInput.trim()}
						>
							{loading ? "Working..." : "Shop"}
						</button>
					</form>

					<div className="examples">
						<span className="examples-label">Try:</span>
						{EXAMPLES.map((ex) => (
							<button
								key={ex}
								type="button"
								className="example-chip"
								onClick={() => onExampleClick(ex)}
								disabled={loading}
							>
								{ex}
							</button>
						))}
					</div>
				</div>
			</header>

			<main className="main">
				{!submittedIntent && !loading && (
					<div className="placeholder">
						<h2>Nothing to show yet</h2>
						<p>
							Enter an outcome above — or pick one of the examples — to see the
							orchestrator in action.
						</p>
					</div>
				)}

				{loading && (
					<div className="loading-card">
						<div>
							<strong>Shopping for:</strong> &ldquo;{submittedIntent}&rdquo;
						</div>
						<div className="loading-steps">
							{LOADING_STEPS.map((step, i) => {
								const state =
									i < loadingStep ? "done" : i === loadingStep ? "active" : "";
								return (
									<div key={step} className={`loading-step ${state}`}>
										<span className="step-indicator">
											{i < loadingStep ? "✓" : ""}
										</span>
										<span>{step}</span>
									</div>
								);
							})}
						</div>
					</div>
				)}

				{error && (
					<div className="error-card">
						<strong>Something went wrong.</strong> {error}
					</div>
				)}

				{result && !loading && <Results result={result} />}
			</main>

			<footer className="footer">
				Powered by Cloudflare Workers &middot; Workers AI &middot; KV. Each
				merchant runs a <code>commerce-llms-txt-template</code> Worker — this
				orchestrator composes across them.
			</footer>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

function Results({ result }: { result: OutcomeResult }) {
	const byMerchant = groupByMerchant(result.recommendations);
	const fulfilledCount = result.recommendations.length;
	const totalNeeds = result.decomposition.length;

	return (
		<div>
			{result.usingSampleData && (
				<div className="notice">
					<strong>Demo mode</strong> — no merchants are configured (or none
					reachable). The orchestrator is composing across a bundled sample
					catalog. Set <code>MERCHANT_ENDPOINTS</code> in{" "}
					<code>wrangler.jsonc</code> to connect real merchants.
				</div>
			)}

			{result.decompositionFallback && (
				<div className="notice">
					<strong>Decomposition fell back to single-need mode</strong> — the AI
					call{" "}
					{result.decompositionFallback === "ai_error"
						? "failed"
						: "returned no parseable needs"}
					. Recommendations will be weaker than normal. Check Worker logs.
				</div>
			)}

			{/* Summary strip */}
			<div className="summary-strip">
				<div className="summary-card">
					<div className="label">Needs identified</div>
					<div className="value">{totalNeeds}</div>
				</div>
				<div className="summary-card">
					<div className="label">Matched</div>
					<div className="value">
						{fulfilledCount} / {totalNeeds}
					</div>
				</div>
				<div className="summary-card">
					<div className="label">Merchants used</div>
					<div className="value">{result.merchantsUsed.length}</div>
				</div>
				<div className="summary-card total">
					<div className="label">Estimated total</div>
					<div className="value">
						{formatPrice(result.totalEstimatedCost, result.currency)}
					</div>
				</div>
			</div>

			{/* Decomposition */}
			<section className="section">
				<div className="section-header">
					<h2>Intent decomposition</h2>
					<span className="section-sub">
						Workers AI broke your intent into these needs
					</span>
				</div>
				<div className="needs-row">
					{result.decomposition.map((need) => {
						const unfulfilled = result.unfulfilledNeeds.some(
							(u) => u.need === need.need,
						);
						return (
							<span
								key={need.need}
								className={`need-chip ${need.priority} ${unfulfilled ? "unfulfilled" : ""}`}
								title={unfulfilled ? "No matching product found" : undefined}
							>
								<span className="priority-dot" />
								{need.need}
							</span>
						);
					})}
				</div>
			</section>

			{/* Recommendations grouped by merchant */}
			<section className="section">
				<div className="section-header">
					<h2>Your cart, assembled across merchants</h2>
					<span className="section-sub">
						{byMerchant.size} merchant{byMerchant.size === 1 ? "" : "s"}{" "}
						&middot; {fulfilledCount} item{fulfilledCount === 1 ? "" : "s"}
					</span>
				</div>

				{[...byMerchant.entries()].map(([merchant, recs]) => {
					const subtotal = recs.reduce((s, r) => s + r.product.price, 0);
					return (
						<div key={merchant} className="merchant-group">
							<div className="merchant-header">
								<div className="merchant-name">{merchant}</div>
								<div className="merchant-stats">
									{recs.length} item{recs.length === 1 ? "" : "s"} &middot;{" "}
									{formatPrice(subtotal, result.currency)}
								</div>
							</div>
							<div className="recommendation-list">
								{recs.map((rec) => (
									<div key={rec.need} className="recommendation-row">
										<div>
											<div className="rec-need">{rec.need}</div>
											<span className={`rec-need-priority ${rec.priority}`}>
												{rec.priority}
											</span>
										</div>
										<div>
											<div className="rec-product-name">{rec.product.name}</div>
											<div className="rec-reasoning">
												{rec.reasoning || rec.product.bestFor}
											</div>
											{rec.alternatives && rec.alternatives.length > 0 && (
												<div className="rec-alternative">
													Alternative: {rec.alternatives[0].name} (
													{formatPrice(
														rec.alternatives[0].price,
														result.currency,
													)}{" "}
													at {rec.alternatives[0].merchantName})
												</div>
											)}
										</div>
										<div className="rec-price">
											{formatPrice(rec.product.price, result.currency)}
										</div>
									</div>
								))}
							</div>
						</div>
					);
				})}
			</section>

			{/* Unfulfilled needs */}
			{result.unfulfilledNeeds.length > 0 && (
				<section className="section">
					<div className="section-header">
						<h2>Not found</h2>
						<span className="section-sub">
							No merchant in the registry carries these
						</span>
					</div>
					<div className="needs-row">
						{result.unfulfilledNeeds.map((need) => (
							<span
								key={need.need}
								className={`need-chip ${need.priority} unfulfilled`}
							>
								{need.need}
							</span>
						))}
					</div>
				</section>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupByMerchant(
	recs: Recommendation[],
): Map<string, Recommendation[]> {
	const map = new Map<string, Recommendation[]>();
	for (const rec of recs) {
		const key = rec.product.merchantName;
		if (!map.has(key)) map.set(key, []);
		map.get(key)!.push(rec);
	}
	return map;
}

function formatPrice(amount: number, currency: string): string {
	try {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: currency || "USD",
		}).format(amount);
	} catch {
		return `${currency || "USD"} ${amount.toFixed(2)}`;
	}
}

export default App;
