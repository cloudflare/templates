import { useEffect, useState } from "react";
import "./App.css";

interface Surface {
	id: string;
	label: string;
	path: string;
	kind: "text" | "json";
}

interface SiteInfo {
	site: { name: string; description: string; origin: string };
	webBotAuthEnabled: boolean;
	surfaces: Surface[];
}

interface Resource {
	slug: string;
	title: string;
	summary: string;
	topics: string[];
	category: string | null;
}

function useSiteInfo() {
	const [info, setInfo] = useState<SiteInfo | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	useEffect(() => {
		async function loadSiteInfo() {
			try {
				const response = await fetch("/api/site");
				if (!response.ok) {
					throw new Error(
						`/api/site returned ${response.status} ${response.statusText}`.trim(),
					);
				}
				setInfo(await response.json());
				setError(null);
			} catch (error) {
				setInfo(null);
				setError(
					error instanceof Error ? error.message : "Could not load /api/site.",
				);
			} finally {
				setLoading(false);
			}
		}

		void loadSiteInfo();
	}, []);
	return { info, loading, error };
}

function SurfacePreview({ surface }: { surface: Surface }) {
	const [open, setOpen] = useState(false);
	const [body, setBody] = useState<string>("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [copied, setCopied] = useState(false);

	async function load() {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch(surface.path);
			if (!res.ok) {
				throw new Error(
					`${surface.path} returned ${res.status} ${res.statusText}`.trim(),
				);
			}
			const text = await res.text();
			if (surface.kind === "json") {
				try {
					setBody(JSON.stringify(JSON.parse(text), null, 2));
				} catch (error) {
					throw new Error(
						`${surface.path} returned invalid JSON${
							error instanceof Error ? `: ${error.message}` : "."
						}`,
					);
				}
			} else {
				setBody(text);
			}
		} catch (error) {
			setBody("");
			setError(
				error instanceof Error
					? error.message
					: `Could not load ${surface.path}.`,
			);
		} finally {
			setLoading(false);
		}
	}

	function toggle() {
		const next = !open;
		setOpen(next);
		if (next && !body) load();
	}

	async function copy() {
		if (!body) return;
		await navigator.clipboard.writeText(body);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	}

	return (
		<div className="surface">
			<div className="surface-head">
				<div>
					<span className="surface-label">{surface.label}</span>
					<code className="surface-path">{surface.path}</code>
				</div>
				<div className="surface-actions">
					<a href={surface.path} target="_blank" rel="noreferrer">
						Open ↗
					</a>
					<button onClick={toggle}>{open ? "Hide" : "Preview"}</button>
				</div>
			</div>
			{open && (
				<div className="surface-body">
					{loading ? (
						<p className="muted">Loading…</p>
					) : error ? (
						<div className="error" role="alert">
							<strong>Preview unavailable.</strong>
							<p>{error}</p>
							<p>Open the surface directly or check the Worker logs.</p>
						</div>
					) : (
						<>
							<button className="copy" onClick={copy}>
								{copied ? "Copied" : "Copy"}
							</button>
							<pre>{body}</pre>
						</>
					)}
				</div>
			)}
		</div>
	);
}

export default function App() {
	const { info, loading: siteLoading, error: siteError } = useSiteInfo();
	const [resources, setResources] = useState<Resource[]>([]);
	const [resourcesLoading, setResourcesLoading] = useState(true);
	const [resourcesError, setResourcesError] = useState<string | null>(null);

	useEffect(() => {
		async function loadResources() {
			try {
				const response = await fetch("/api/resources");
				if (!response.ok) {
					throw new Error(
						`/api/resources returned ${response.status} ${response.statusText}`.trim(),
					);
				}
				const data = await response.json();
				setResources(data.resources ?? []);
				setResourcesError(null);
			} catch (error) {
				setResources([]);
				setResourcesError(
					error instanceof Error
						? error.message
						: "Could not load /api/resources.",
				);
			} finally {
				setResourcesLoading(false);
			}
		}

		void loadResources();
	}, []);

	if (siteLoading) {
		return (
			<main className="container">
				<p className="muted">Loading…</p>
			</main>
		);
	}

	if (!info) {
		return (
			<main className="container">
				<div className="error" role="alert">
					<strong>Could not load site metadata.</strong>
					<p>{siteError ?? "The /api/site response was empty."}</p>
					<p>Refresh the page or check the Worker logs for /api/site.</p>
				</div>
			</main>
		);
	}

	return (
		<main className="container">
			<header>
				<p className="kicker">AI Agent Visibility</p>
				<h1>{info.site.name}</h1>
				<p className="lede">{info.site.description}</p>
				<p className="muted">
					One enriched content store, served to AI agents through every
					discovery surface below — generated by Workers AI, cached in KV.
				</p>
			</header>

			<section>
				<h2>Agent surfaces</h2>
				<p className="muted">
					The same content, in whichever convention an agent prefers.
				</p>
				<div className="surfaces">
					{info.surfaces.map((s) => (
						<SurfacePreview key={s.id} surface={s} />
					))}
				</div>
				{info.webBotAuthEnabled && (
					<p className="muted">
						Web Bot Auth identity surface is <strong>enabled</strong> at{" "}
						<code>/.well-known/web-bot-auth/directory</code>.
					</p>
				)}
			</section>

			<section>
				<h2>Indexed pages ({resources.length})</h2>
				{resourcesLoading ? (
					<p className="muted">Loading indexed pages…</p>
				) : resourcesError ? (
					<div className="error" role="alert">
						<strong>Could not load indexed pages.</strong>
						<p>{resourcesError}</p>
						<p>Check /api/resources or the Worker logs, then refresh.</p>
					</div>
				) : resources.length === 0 ? (
					<p className="muted">
						No indexed pages returned from /api/resources.
					</p>
				) : (
					<div className="cards">
						{resources.map((r) => (
							<article className="card" key={r.slug}>
								<h3>
									<a href={`/${r.slug}.md`} target="_blank" rel="noreferrer">
										{r.title}
									</a>
								</h3>
								{r.category && <span className="tag">{r.category}</span>}
								<p>{r.summary}</p>
								{r.topics.length > 0 && (
									<p className="topics">{r.topics.join(" · ")}</p>
								)}
							</article>
						))}
					</div>
				)}
			</section>

			<footer>
				<p className="muted">
					Built on Cloudflare Workers + Workers AI + KV. Replace the sample
					content in <code>src/lib/content.ts</code> or POST your own pages to{" "}
					<code>/api/resources</code>.
				</p>
			</footer>
		</main>
	);
}
