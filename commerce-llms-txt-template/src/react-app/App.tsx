import { useEffect, useState } from "react";
import "./App.css";

// ---------------------------------------------------------------------------
// Types (kept in sync with src/lib/types.ts — duplicated here so the SPA
// tsconfig doesn't need to reach into worker sources)
// ---------------------------------------------------------------------------

interface RawProduct {
	slug: string;
	name: string;
	price: number;
	currency: string;
	category: string;
	inStock: boolean;
	stockCount: number;
	specs: Record<string, string>;
	description: string;
	imageUrl?: string;
	lastUpdated: string;
}

interface EnrichedProduct extends RawProduct {
	agentSummary: string;
	useCaseTags: string[];
	highlights: string[];
	bestFor: string;
}

interface RawCatalogResponse {
	merchant: string;
	source: string;
	productCount: number;
	products: RawProduct[];
}

interface EnrichedCatalogResponse {
	merchant: string;
	productCount: number;
	generatedAt: string;
	products: EnrichedProduct[];
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

function App() {
	const [raw, setRaw] = useState<RawCatalogResponse | null>(null);
	const [enriched, setEnriched] = useState<EnrichedCatalogResponse | null>(
		null,
	);
	const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		async function load() {
			setLoading(true);
			setError(null);
			try {
				const [rawRes, enrichedRes] = await Promise.all([
					fetch("/api/raw-catalog"),
					fetch("/api/products"),
				]);
				if (!rawRes.ok || !enrichedRes.ok) {
					throw new Error(
						`API error (raw=${rawRes.status}, enriched=${enrichedRes.status})`,
					);
				}
				const rawJson = (await rawRes.json()) as RawCatalogResponse;
				const enrichedJson =
					(await enrichedRes.json()) as EnrichedCatalogResponse;
				if (cancelled) return;
				setRaw(rawJson);
				setEnriched(enrichedJson);
				if (rawJson.products.length > 0 && !selectedSlug) {
					setSelectedSlug(rawJson.products[0].slug);
				}
			} catch (err) {
				if (cancelled) return;
				setError(err instanceof Error ? err.message : String(err));
			} finally {
				if (!cancelled) setLoading(false);
			}
		}

		load();
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const rawProduct = raw?.products.find((p) => p.slug === selectedSlug);
	const enrichedProduct = enriched?.products.find(
		(p) => p.slug === selectedSlug,
	);

	return (
		<div className="page">
			<header className="hero">
				<div className="hero-inner">
					<div className="badges">
						<span className="badge badge-ai">Workers AI</span>
						<span className="badge badge-kv">KV Cache</span>
						<span className="badge badge-shopify">Shopify</span>
					</div>
					<h1>Commerce llms.txt</h1>
					<p className="tagline">
						Raw merchant catalog in. Agent-ready <code>/llms.txt</code> out.
					</p>
					<p className="sub">
						Workers AI turns thin product data into descriptions that AI
						shopping agents can actually reason with. Pick a product below to
						see the transformation live against this Worker's own endpoints.
					</p>
					<div className="endpoints">
						<a href="/llms.txt" target="_blank" rel="noreferrer">
							/llms.txt
						</a>
						<a href="/llms-full.txt" target="_blank" rel="noreferrer">
							/llms-full.txt
						</a>
						<a href="/api/products" target="_blank" rel="noreferrer">
							/api/products
						</a>
						<a href="/api/raw-catalog" target="_blank" rel="noreferrer">
							/api/raw-catalog
						</a>
					</div>
				</div>
			</header>

			<main className="main">
				{loading && (
					<div className="status">Loading catalog from this Worker…</div>
				)}
				{error && (
					<div className="status status-error">
						Couldn't load catalog: {error}
					</div>
				)}

				{raw && enriched && (
					<>
						<section className="meta-bar">
							<div>
								<span className="meta-label">Merchant</span>
								<span className="meta-value">{raw.merchant}</span>
							</div>
							<div>
								<span className="meta-label">Source</span>
								<span className="meta-value">{raw.source}</span>
							</div>
							<div>
								<span className="meta-label">Products</span>
								<span className="meta-value">{raw.productCount}</span>
							</div>
							<div>
								<span className="meta-label">Generated</span>
								<span className="meta-value">
									{new Date(enriched.generatedAt).toLocaleTimeString()}
								</span>
							</div>
						</section>

						<section className="product-picker">
							<label htmlFor="product-select">Product</label>
							<select
								id="product-select"
								value={selectedSlug ?? ""}
								onChange={(e) => setSelectedSlug(e.target.value)}
							>
								{raw.products.map((p) => (
									<option key={p.slug} value={p.slug}>
										{p.name}
									</option>
								))}
							</select>
						</section>

						{rawProduct && enrichedProduct && (
							<section className="split">
								<article className="panel panel-raw">
									<header className="panel-header">
										<span className="panel-label">
											Input · Raw merchant data
										</span>
										<h2>{rawProduct.name}</h2>
									</header>
									<dl className="kv">
										<dt>Slug</dt>
										<dd>
											<code>{rawProduct.slug}</code>
										</dd>
										<dt>Category</dt>
										<dd>{rawProduct.category}</dd>
										<dt>Price</dt>
										<dd>
											{rawProduct.currency} {rawProduct.price.toFixed(2)}
										</dd>
										<dt>Stock</dt>
										<dd>
											{rawProduct.inStock
												? `${rawProduct.stockCount} in stock`
												: "out of stock"}
										</dd>
										<dt>Description</dt>
										<dd className="desc">
											{rawProduct.description || <em>(none)</em>}
										</dd>
										<dt>Specs</dt>
										<dd>
											<ul className="specs">
												{Object.entries(rawProduct.specs).map(([k, v]) => (
													<li key={k}>
														<span className="spec-key">{k}</span>
														<span className="spec-val">{v}</span>
													</li>
												))}
											</ul>
										</dd>
									</dl>
								</article>

								<div className="arrow" aria-hidden="true">
									<span>Workers AI</span>
									<svg width="28" height="14" viewBox="0 0 28 14" fill="none">
										<path
											d="M1 7h25m0 0-6-6m6 6-6 6"
											stroke="currentColor"
											strokeWidth="1.5"
											strokeLinecap="round"
											strokeLinejoin="round"
										/>
									</svg>
								</div>

								<article className="panel panel-enriched">
									<header className="panel-header">
										<span className="panel-label">Output · Agent-ready</span>
										<h2>{enrichedProduct.name}</h2>
									</header>
									<dl className="kv">
										<dt>Agent summary</dt>
										<dd className="desc">{enrichedProduct.agentSummary}</dd>
										<dt>Best for</dt>
										<dd className="desc">{enrichedProduct.bestFor}</dd>
										<dt>Highlights</dt>
										<dd>
											<ul className="highlights">
												{enrichedProduct.highlights.map((h, i) => (
													<li key={i}>{h}</li>
												))}
											</ul>
										</dd>
										<dt>Use-case tags</dt>
										<dd>
											<div className="tags">
												{enrichedProduct.useCaseTags.map((t) => (
													<span key={t} className="tag">
														{t}
													</span>
												))}
											</div>
										</dd>
									</dl>
								</article>
							</section>
						)}
					</>
				)}
			</main>

			<footer className="footer">
				<p>
					Built on{" "}
					<a
						href="https://developers.cloudflare.com/workers/"
						target="_blank"
						rel="noreferrer"
					>
						Cloudflare Workers
					</a>
					{" · "}
					<a
						href="https://developers.cloudflare.com/workers-ai/"
						target="_blank"
						rel="noreferrer"
					>
						Workers AI
					</a>
					{" · "}
					<a
						href="https://developers.cloudflare.com/kv/"
						target="_blank"
						rel="noreferrer"
					>
						KV
					</a>
				</p>
			</footer>
		</div>
	);
}

export default App;
