const API_ORIGIN = "https://xquik.com";
const POST_ID = /^\d+$/;

export type Post = {
	id: string;
	text: string;
	authorUsername: string;
	authorName: string;
	createdAt: string;
	likeCount: number;
	repostCount: number;
	replyCount: number;
};

export type SyncOutcome =
	| "ok"
	| "invalid_key"
	| "no_credits"
	| "rate_limited"
	| "failed";

export type SearchResult =
	| { outcome: "ok"; posts: Post[] }
	| { outcome: Exclude<SyncOutcome, "ok"> };

type SearchParams = {
	apiKey: string;
	query: string;
	limit: number;
	sinceId: string | null;
};

const OUTCOME_BY_STATUS: Partial<Record<number, Exclude<SyncOutcome, "ok">>> = {
	401: "invalid_key",
	402: "no_credits",
	429: "rate_limited",
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function count(value: unknown): number {
	return typeof value === "number" ? value : 0;
}

function isoTime(value: unknown): string {
	const time = typeof value === "string" ? Date.parse(value) : Number.NaN;
	return Number.isNaN(time) ? "" : new Date(time).toISOString();
}

function parsePost(raw: unknown): Post | null {
	if (!isRecord(raw) || !isRecord(raw.author)) return null;
	const { id, text, createdAt, likeCount, retweetCount, replyCount } = raw;
	const { username, name } = raw.author;
	if (typeof id !== "string" || !POST_ID.test(id)) return null;
	if (typeof text !== "string" || typeof username !== "string") return null;
	return {
		id,
		text,
		authorUsername: username,
		authorName: typeof name === "string" ? name : username,
		createdAt: isoTime(createdAt),
		likeCount: count(likeCount),
		repostCount: count(retweetCount),
		replyCount: count(replyCount),
	};
}

export async function searchPosts({
	apiKey,
	query,
	limit,
	sinceId,
}: SearchParams): Promise<SearchResult> {
	const url = new URL("/api/v1/x/tweets/search", API_ORIGIN);
	url.searchParams.set("q", query);
	url.searchParams.set("limit", String(limit));
	url.searchParams.set("queryType", "Latest");
	if (sinceId !== null) url.searchParams.set("sinceId", sinceId);

	try {
		const response = await fetch(url, { headers: { "x-api-key": apiKey } });
		if (!response.ok) {
			console.error(`Xquik search returned HTTP ${response.status}`);
			return { outcome: OUTCOME_BY_STATUS[response.status] ?? "failed" };
		}
		const body: unknown = await response.json();
		if (!isRecord(body) || !Array.isArray(body.tweets)) {
			return { outcome: "failed" };
		}
		const posts = body.tweets.map(parsePost).filter((post) => post !== null);
		return { outcome: "ok", posts };
	} catch {
		return { outcome: "failed" };
	}
}

export async function isKeyRejected(apiKey: string): Promise<boolean> {
	try {
		const url = new URL("/api/v1/account", API_ORIGIN);
		const response = await fetch(url, { headers: { "x-api-key": apiKey } });
		return response.status === 401;
	} catch {
		return false;
	}
}
