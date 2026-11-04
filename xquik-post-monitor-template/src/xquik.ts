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

const OUTCOME_BY_ERROR_CODE = new Map<string, Exclude<SyncOutcome, "ok">>([
	["api_key_paused", "invalid_key"],
]);

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

async function errorCode(response: Response): Promise<string | null> {
	const body: unknown = await response.json().catch(() => null);
	return isRecord(body) && typeof body.error === "string" ? body.error : null;
}

function outcomeOf(
	status: number,
	code: string | null,
): Exclude<SyncOutcome, "ok"> {
	const byCode = code === null ? undefined : OUTCOME_BY_ERROR_CODE.get(code);
	return byCode ?? OUTCOME_BY_STATUS[status] ?? "failed";
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
			const code = await errorCode(response);
			console.error(
				`Xquik search returned HTTP ${response.status} with error code ${code ?? "none"}`,
			);
			return { outcome: outcomeOf(response.status, code) };
		}
		const body: unknown = await response.json().catch(() => null);
		if (!isRecord(body) || !Array.isArray(body.tweets)) {
			console.error("Xquik search returned a body without a tweets list");
			return { outcome: "failed" };
		}
		const posts = body.tweets.map(parsePost).filter((post) => post !== null);
		return { outcome: "ok", posts };
	} catch (error) {
		console.error(`Xquik search failed with ${String(error)}`);
		return { outcome: "failed" };
	}
}

export async function isKeyRejected(apiKey: string): Promise<boolean> {
	try {
		const url = new URL("/api/v1/account", API_ORIGIN);
		const response = await fetch(url, { headers: { "x-api-key": apiKey } });
		if (response.ok) return false;
		return (
			outcomeOf(response.status, await errorCode(response)) === "invalid_key"
		);
	} catch {
		return false;
	}
}
