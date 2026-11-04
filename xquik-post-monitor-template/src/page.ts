import type { LastSync } from "./store";
import type { Post, SyncOutcome } from "./xquik";

export type Notice =
	| Exclude<SyncOutcome, "ok">
	| "missing_key"
	| "sync_pending";

export type PageModel = {
	query: string;
	posts: Post[];
	sample: boolean;
	notice: Notice | null;
	lastSync: LastSync | null;
};

type NoticeCopy = { tone: "warning" | "info"; title: string; body: string };

const NOTICES: Record<Notice, NoticeCopy> = {
	missing_key: {
		tone: "warning",
		title: "Demo mode",
		body: "These are sample posts, not live data. Add XQUIK_API_KEY to track live posts.",
	},
	invalid_key: {
		tone: "warning",
		title: "API key rejected",
		body: "Xquik rejected the API key. Resume it in your Xquik dashboard, or set a new XQUIK_API_KEY secret.",
	},
	no_credits: {
		tone: "warning",
		title: "No credits left",
		body: "This Xquik account has no credits left. Top up at xquik.com.",
	},
	rate_limited: {
		tone: "info",
		title: "Rate limited",
		body: "Xquik rate limited the last run. The next run retries.",
	},
	failed: {
		tone: "warning",
		title: "Last run failed",
		body: "The last run failed. Check the Worker logs.",
	},
	sync_pending: {
		tone: "info",
		title: "Waiting for the next run",
		body: "Posts appear after the next scheduled run.",
	},
};

const HTML_ESCAPES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};

const TIME_FORMAT = new Intl.DateTimeFormat("en", {
	dateStyle: "medium",
	timeStyle: "short",
	timeZone: "UTC",
});

const STYLES = `
:root {
	color-scheme: light dark;
	--page: #f6f6f4;
	--card: #ffffff;
	--text: #1a1a18;
	--muted: #55554f;
	--line: #d6d6d0;
	--link: #1447b8;
	--warning-fill: #8a3100;
	--warning-text: #ffffff;
	--info-fill: #1c3f8f;
	--info-text: #ffffff;
}
@media (prefers-color-scheme: dark) {
	:root {
		--page: #141413;
		--card: #1e1e1c;
		--text: #f1f1ec;
		--muted: #b4b4ab;
		--line: #3a3a36;
		--link: #9dbcff;
		--warning-fill: #ffc266;
		--warning-text: #1a1a18;
		--info-fill: #b5ccff;
		--info-text: #1a1a18;
	}
}
* { box-sizing: border-box; }
body {
	margin: 0;
	background: var(--page);
	color: var(--text);
	font: 16px/1.5 system-ui, sans-serif;
}
a { color: var(--link); }
.page { max-width: 40rem; margin: 0 auto; padding: 2rem 1rem; }
h1 { margin: 0; font-size: 1.75rem; line-height: 1.2; }
h2 { margin: 2rem 0 0.75rem; font-size: 1.125rem; }
.meta { margin: 0.25rem 0 0; color: var(--muted); font-size: 0.875rem; }
.query { margin: 0.5rem 0 0; overflow-wrap: anywhere; }
.notice { margin-top: 1.5rem; padding: 0.75rem 1rem; border-radius: 0.5rem; }
.notice-warning { background: var(--warning-fill); color: var(--warning-text); }
.notice-info { background: var(--info-fill); color: var(--info-text); }
.notice-title { margin: 0; font-weight: 700; }
.notice-body { margin: 0; }
.post {
	margin-top: 0.75rem;
	padding: 1rem;
	background: var(--card);
	border: 1px solid var(--line);
	border-radius: 0.5rem;
}
.author { display: flex; flex-wrap: wrap; gap: 0 0.5rem; overflow-wrap: anywhere; }
.author-name { font-weight: 600; }
.author-username { color: var(--muted); }
.label {
	padding: 0 0.5rem;
	border: 1px solid var(--muted);
	border-radius: 0.25rem;
	font-size: 0.75rem;
	font-weight: 700;
	line-height: 1.5rem;
}
.text { margin: 0.5rem 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.stats {
	display: flex;
	flex-wrap: wrap;
	gap: 0.25rem 1rem;
	color: var(--muted);
	font-size: 0.875rem;
}
.empty { color: var(--muted); }
footer {
	margin-top: 2rem;
	padding-top: 1rem;
	border-top: 1px solid var(--line);
	color: var(--muted);
	font-size: 0.875rem;
}
footer p { margin: 0.25rem 0 0; }
`;

function esc(value: string | number): string {
	return String(value).replace(
		/[&<>"']/g,
		(character) => HTML_ESCAPES[character],
	);
}

function formatTime(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return `${TIME_FORMAT.format(date)} UTC`;
}

function renderTime(value: string): string {
	return `<time datetime="${esc(value)}">${esc(formatTime(value))}</time>`;
}

function renderNotice(notice: Notice): string {
	const { tone, title, body } = NOTICES[notice];
	const role = tone === "warning" ? "alert" : "status";
	return `<div class="notice notice-${tone}" role="${role}">
	<p class="notice-title">${esc(title)}</p>
	<p class="notice-body">${esc(body)}</p>
</div>`;
}

function renderPost(post: Post, sample: boolean): string {
	const postUrl = `https://x.com/${encodeURIComponent(post.authorUsername)}/status/${post.id}`;
	const label = sample ? `<span class="label">Sample</span>` : "";
	const link = sample ? "" : `<a href="${esc(postUrl)}">View on X</a>`;
	return `<article class="post">
	<div class="author">
		<span class="author-name">${esc(post.authorName)}</span>
		<span class="author-username">@${esc(post.authorUsername)}</span>
		${label}
	</div>
	<p class="text">${esc(post.text)}</p>
	<div class="stats">
		${renderTime(post.createdAt)}
		<span>Likes ${esc(post.likeCount)}</span>
		<span>Reposts ${esc(post.repostCount)}</span>
		<span>Replies ${esc(post.replyCount)}</span>
		${link}
	</div>
</article>`;
}

function renderPosts({ posts, sample }: PageModel): string {
	if (posts.length === 0) {
		return `<p class="empty">No posts stored for this search term yet.</p>`;
	}
	const countsNote = sample
		? ""
		: `<p class="meta">The Worker stores counts once, when it first fetches a post.</p>\n`;
	return countsNote + posts.map((post) => renderPost(post, sample)).join("\n");
}

export function renderPage(model: PageModel): string {
	const { query, sample, notice, lastSync } = model;
	const lastRun = lastSync
		? `<p class="meta">Last run ${renderTime(lastSync.ranAt)}</p>`
		: "";
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Xquik Post Monitor</title>
<style>${STYLES}</style>
</head>
<body>
<div class="page">
<header>
	<h1>Xquik Post Monitor</h1>
	<p class="query">Search term <strong>${esc(query)}</strong></p>
	${lastRun}
</header>
<main>
${notice ? renderNotice(notice) : ""}
<h2>${sample ? "Sample data" : "Latest posts"}</h2>
${renderPosts(model)}
</main>
<footer>
	<p>Built with <a href="https://xquik.com">Xquik</a>, an X Twitter data API.</p>
	<p>Xquik is an independent third-party service. Not affiliated with X Corp. "Twitter" and "X" are trademarks of X Corp.</p>
</footer>
</div>
</body>
</html>
`;
}
