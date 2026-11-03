import { createScheduledController, env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker, { type Bindings } from "../src/index";
import { SAMPLE_POSTS } from "../src/samples";

const API_KEY = "test-secret-key";
const QUERY = "cloudflare workers";
const SEARCH_URL = "https://xquik.com/api/v1/x/tweets/search";
const ACCOUNT_URL = "https://xquik.com/api/v1/account";
const LEGAL_LINE =
	'Xquik is an independent third-party service. Not affiliated with X Corp. "Twitter" and "X" are trademarks of X Corp.';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

type Reply = () => Response;

const UNTOUCHED_DB = new Proxy({} as D1Database, {
	get() {
		throw new Error("Demo mode must not touch D1");
	},
});

let outbound: Request[] = [];
let logLines: string[] = [];
let errorLines: string[] = [];

function stubXquik({
	search = () => searchReply([]),
	account = () => Response.json({ plan: "active" }),
}: { search?: Reply; account?: Reply } = {}) {
	const replies: Record<string, Reply> = {
		[SEARCH_URL]: search,
		[ACCOUNT_URL]: account,
	};
	vi.stubGlobal(
		"fetch",
		async (input: RequestInfo | URL, init?: RequestInit) => {
			const request = new Request(input, init);
			outbound.push(request);
			const { origin, pathname } = new URL(request.url);
			const reply = replies[origin + pathname];
			if (!reply) throw new Error(`Unexpected request to ${request.url}`);
			return reply();
		},
	);
}

function searchRequests(): Request[] {
	return outbound.filter((request) => request.url.startsWith(SEARCH_URL));
}

function accountRequests(): Request[] {
	return outbound.filter((request) => request.url.startsWith(ACCOUNT_URL));
}

function searchParams(request: Request): Record<string, string> {
	return Object.fromEntries(new URL(request.url).searchParams);
}

function liveEnv(overrides: Partial<Bindings> = {}): Bindings {
	return {
		DB: env.DB,
		XQUIK_API_KEY: API_KEY,
		XQUIK_SEARCH_QUERY: QUERY,
		XQUIK_SEARCH_LIMIT: 10,
		...overrides,
	};
}

function tweet(overrides: Record<string, unknown> = {}) {
	return {
		id: "100",
		text: "A live post",
		createdAt: "2026-03-01T10:00:00.000Z",
		likeCount: 4,
		retweetCount: 2,
		replyCount: 1,
		author: { username: "live_author", name: "Live Author" },
		...overrides,
	};
}

function searchReply(tweets: unknown[]): Response {
	return Response.json({ tweets, has_next_page: false, next_cursor: "" });
}

function status(code: number, body: string | null = null): Reply {
	return () => new Response(body, { status: code });
}

function failedFetch(): Response {
	throw new TypeError("Network connection lost");
}

async function runCron(bindings: Bindings) {
	await worker.scheduled(
		createScheduledController({
			cron: "0 */6 * * *",
			scheduledTime: new Date("2026-03-01T12:00:00.000Z"),
		}),
		bindings,
	);
}

function open(bindings: Bindings, path = "/", method = "GET") {
	return worker.fetch(
		new IncomingRequest(`https://example.com${path}`, { method }),
		bindings,
	);
}

async function pageHtml(bindings: Bindings): Promise<string> {
	const response = await open(bindings);
	expect(response.status).toBe(200);
	return response.text();
}

function postIdsInOrder(html: string): string[] {
	return [...html.matchAll(/\/status\/(\d+)"/g)].map(([, id]) => id);
}

function storedPostCount() {
	return env.DB.prepare("SELECT COUNT(*) AS total FROM posts").first<number>(
		"total",
	);
}

function storedOutcome() {
	return env.DB.prepare("SELECT outcome FROM sync_status").first<string>(
		"outcome",
	);
}

beforeEach(async () => {
	await env.DB.batch([
		env.DB.prepare("DELETE FROM posts"),
		env.DB.prepare("DELETE FROM sync_status"),
	]);
	outbound = [];
	logLines = [];
	errorLines = [];
	stubXquik();
	vi.spyOn(console, "log").mockImplementation((...parts) => {
		logLines.push(parts.join(" "));
	});
	vi.spyOn(console, "error").mockImplementation((...parts) => {
		errorLines.push(parts.join(" "));
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("demo mode", () => {
	it.each([
		["missing", undefined],
		["empty", ""],
		["blank", "   "],
	])("renders labelled samples with a %s key", async (_name, apiKey) => {
		const html = await pageHtml(
			liveEnv({ DB: UNTOUCHED_DB, XQUIK_API_KEY: apiKey }),
		);

		expect(html).toContain('role="alert"');
		expect(html).toContain("Demo mode");
		expect(html).toContain("sample posts");
		expect(html).toContain("XQUIK_API_KEY");
		expect(html).toContain("Sample data");
		expect(html.match(/>Sample</g)).toHaveLength(SAMPLE_POSTS.length);
		for (const post of SAMPLE_POSTS) {
			expect(post.text.startsWith("Sample post")).toBe(true);
			expect(html).toContain(post.text);
		}
		expect(html).not.toContain("View on X");
		expect(outbound).toEqual([]);
	});

	it("skips the scheduled run with no fetch & no D1 write", async () => {
		await runCron(liveEnv({ XQUIK_API_KEY: undefined }));

		expect(outbound).toEqual([]);
		expect(await storedPostCount()).toBe(0);
		expect(await storedOutcome()).toBeNull();
	});
});

describe("scheduled sync", () => {
	it("sends the search request, stores posts & lists them", async () => {
		stubXquik({ search: () => searchReply([tweet()]) });

		await runCron(liveEnv());

		const [request] = searchRequests();
		expect(outbound).toHaveLength(1);
		expect(request.method).toBe("GET");
		expect(request.url.split("?")[0]).toBe(SEARCH_URL);
		expect(searchParams(request)).toEqual({
			q: QUERY,
			limit: "10",
			queryType: "Latest",
		});
		expect(request.headers.get("x-api-key")).toBe(API_KEY);
		expect(logLines).toContainEqual(expect.stringContaining("ok"));
		expect(errorLines).toEqual([]);

		const html = await pageHtml(liveEnv());
		expect(html).toContain("A live post");
		expect(html).toContain("Live Author");
		expect(html).toContain("@live_author");
		expect(html).toContain("Likes 4");
		expect(html).toContain("Reposts 2");
		expect(html).toContain("Replies 1");
		expect(html).toContain('<time datetime="2026-03-01T10:00:00.000Z">');
		expect(html).toContain('href="https://x.com/live_author/status/100"');
		expect(html).toContain(
			'Last run <time datetime="2026-03-01T12:00:00.000Z"',
		);
		expect(html).not.toContain(">Sample<");
		expect(html).not.toContain("Sample data");
		expect(html).not.toContain('role="alert"');
		expect(html).not.toContain('role="status"');
		expect(accountRequests()).toEqual([]);
	});

	it("stores the X time format as an ISO time", async () => {
		stubXquik({
			search: () =>
				searchReply([tweet({ createdAt: "Tue Nov 03 02:05:57 +0000 2026" })]),
		});

		await runCron(liveEnv());

		const html = await pageHtml(liveEnv());
		expect(html).toContain('<time datetime="2026-11-03T02:05:57.000Z">');
	});

	it("resumes from the newest stored post & stores repeats once", async () => {
		stubXquik({ search: () => searchReply([tweet({ id: "100" })]) });
		await runCron(liveEnv());

		stubXquik({
			search: () => searchReply([tweet({ id: "101" }), tweet({ id: "100" })]),
		});
		await runCron(liveEnv());

		expect(searchParams(searchRequests()[1]).sinceId).toBe("100");
		expect(await storedPostCount()).toBe(2);
		expect(postIdsInOrder(await pageHtml(liveEnv()))).toEqual(["101", "100"]);
	});

	it("keeps exact order & value for IDs beyond safe integers", async () => {
		const newestFirst = [
			"2000000000000000000",
			"1999999999999999999",
			"1000000000000000000",
			"999999999999999999",
			"9007199254740993",
			"9007199254740992",
		];
		const shuffled = [3, 0, 5, 2, 4, 1].map((index) => newestFirst[index]);
		stubXquik({
			search: () => searchReply(shuffled.map((id) => tweet({ id }))),
		});

		await runCron(liveEnv());
		await runCron(liveEnv());

		expect(postIdsInOrder(await pageHtml(liveEnv()))).toEqual(newestFirst);
		expect(searchParams(searchRequests()[1]).sinceId).toBe(newestFirst[0]);
	});

	it.each([
		{
			name: "HTTP 401",
			search: status(401),
			outcome: "invalid_key",
			notice: "Xquik rejected the API key",
		},
		{
			name: "HTTP 402",
			search: status(402),
			outcome: "no_credits",
			notice: "no credits left",
		},
		{
			name: "HTTP 429",
			search: status(429),
			outcome: "rate_limited",
			notice: "The next run retries",
		},
		{
			name: "HTTP 500",
			search: status(500),
			outcome: "failed",
			notice: "Check the Worker logs",
		},
		{
			name: "a thrown fetch",
			search: failedFetch,
			outcome: "failed",
			notice: "Check the Worker logs",
		},
		{
			name: "invalid JSON",
			search: status(200, "not json"),
			outcome: "failed",
			notice: "Check the Worker logs",
		},
		{
			name: "a body without tweets",
			search: () => Response.json({ has_next_page: false }),
			outcome: "failed",
			notice: "Check the Worker logs",
		},
	])(
		"records $outcome after $name & shows its notice",
		async ({ search, outcome, notice }) => {
			stubXquik({ search, account: status(401) });

			await runCron(liveEnv());

			expect(await storedOutcome()).toBe(outcome);
			expect(await storedPostCount()).toBe(0);
			expect(errorLines).toContainEqual(expect.stringContaining(outcome));
			expect(await pageHtml(liveEnv())).toContain(notice);
		},
	);

	it("keeps stored posts through a failed run & clears the notice later", async () => {
		stubXquik({ search: () => searchReply([tweet()]) });
		await runCron(liveEnv());

		stubXquik({ search: status(500) });
		await runCron(liveEnv());
		const failedHtml = await pageHtml(liveEnv());
		expect(failedHtml).toContain("Check the Worker logs");
		expect(failedHtml).toContain("A live post");

		stubXquik({ search: () => searchReply([]) });
		await runCron(liveEnv());
		const recoveredHtml = await pageHtml(liveEnv());
		expect(recoveredHtml).not.toContain("Check the Worker logs");
		expect(recoveredHtml).toContain("A live post");
	});

	it("drops malformed rows & keeps valid rows from the same response", async () => {
		stubXquik({
			search: () =>
				searchReply([
					null,
					"not a row",
					tweet({ id: 300, text: "numeric ID" }),
					tweet({ id: "not-digits", text: "word ID" }),
					tweet({ id: "301", text: 42 }),
					tweet({ id: "302", text: "no author", author: undefined }),
					tweet({ id: "303", text: "bad author", author: { username: 7 } }),
					tweet({ id: "304", text: "A valid post" }),
					{ id: "305", text: "A bare post", author: { username: "bare" } },
				]),
		});

		await runCron(liveEnv());

		expect(await storedOutcome()).toBe("ok");
		expect(await storedPostCount()).toBe(2);
		const html = await pageHtml(liveEnv());
		expect(postIdsInOrder(html)).toEqual(["305", "304"]);
		expect(html).toContain('<span class="author-name">bare</span>');
		expect(html).toContain("Likes 0");
		expect(html).toContain("Reposts 0");
		expect(html).toContain("Replies 0");
	});

	it("reads only the search term in use", async () => {
		stubXquik({
			search: () => searchReply([tweet({ text: "Old term post" })]),
		});
		await runCron(liveEnv({ XQUIK_SEARCH_QUERY: "old term" }));

		stubXquik({ search: () => searchReply([]) });
		const newTerm = liveEnv({ XQUIK_SEARCH_QUERY: "new term" });
		const html = await pageHtml(newTerm);
		expect(html).not.toContain("Old term post");
		expect(html).toContain("No posts yet");

		await runCron(newTerm);
		expect(searchParams(searchRequests()[1]).sinceId).toBeUndefined();
	});
});

describe("page notices", () => {
	it("clears the invalid key warning after a key rotation", async () => {
		stubXquik({ search: status(401), account: status(401) });
		await runCron(liveEnv());
		expect(await pageHtml(liveEnv())).toContain("Xquik rejected the API key");

		stubXquik();
		const html = await pageHtml(liveEnv({ XQUIK_API_KEY: "rotated-key" }));

		expect(html).not.toContain("Xquik rejected the API key");
		expect(html).toContain("The API key works");
		expect(html).toContain('role="status"');
		expect(html).not.toContain('role="alert"');
	});

	it("warns about a rejected key before the first run", async () => {
		stubXquik({ account: status(401) });

		const html = await pageHtml(liveEnv());

		expect(html).toContain('role="alert"');
		expect(html).toContain("Xquik rejected the API key");
		expect(accountRequests()[0].headers.get("x-api-key")).toBe(API_KEY);
	});

	it.each([
		["a thrown fetch", failedFetch],
		["HTTP 429", status(429)],
		["HTTP 500", status(500)],
	])("accepts the key when the key check gets %s", async (_name, account) => {
		stubXquik({ account });

		const html = await pageHtml(liveEnv());

		expect(html).toContain("The API key works");
		expect(html).not.toContain("Xquik rejected the API key");
		expect(html).toContain("No posts yet");
	});
});

describe("page output", () => {
	it("escapes post text, authors & the search term", async () => {
		const payload = `<script>alert("x")</script>`;
		const username = `"><script>alert('u')</script>`;
		const bindings = liveEnv({ XQUIK_SEARCH_QUERY: payload });
		stubXquik({
			search: () =>
				searchReply([
					tweet({ text: payload, author: { username, name: payload } }),
				]),
		});

		await runCron(bindings);
		const html = await pageHtml(bindings);

		expect(html).not.toContain("<script");
		expect(
			html.match(/&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/g),
		).toHaveLength(3);
		expect(html).toContain(
			"@&quot;&gt;&lt;script&gt;alert(&#39;u&#39;)&lt;/script&gt;",
		);
		expect(html).toContain('href="https://x.com/%22%3E%3Cscript%3Ealert(');
	});

	it("sends the security headers & legal line", async () => {
		const response = await open(liveEnv({ XQUIK_API_KEY: undefined }));

		expect(response.headers.get("content-type")).toBe(
			"text/html; charset=utf-8",
		);
		expect(response.headers.get("content-security-policy")).toBe(
			"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
		);
		expect(response.headers.get("x-content-type-options")).toBe("nosniff");
		const html = await response.text();
		expect(html).toContain(LEGAL_LINE);
		expect(html).toContain('href="https://xquik.com"');
	});

	it("keeps the key & raw error bodies out of responses & logs", async () => {
		stubXquik({
			search: status(500, `raw error body ${API_KEY}`),
			account: status(401, `raw error body ${API_KEY}`),
		});
		await runCron(liveEnv());

		const responses = await Promise.all([
			open(liveEnv()),
			open(liveEnv(), "/missing"),
			open(liveEnv(), "/", "POST"),
		]);
		const bodies = await Promise.all(responses.map((reply) => reply.text()));

		expect(errorLines.length).toBeGreaterThan(0);
		for (const text of [...bodies, ...logLines, ...errorLines]) {
			expect(text).not.toContain(API_KEY);
			expect(text).not.toContain("raw error body");
		}
	});
});

describe("routes", () => {
	it("returns 404 for an unknown path", async () => {
		expect((await open(liveEnv(), "/missing")).status).toBe(404);
	});

	it.each(["POST", "PUT", "DELETE"])(
		"returns 405 with allow for %s on the page",
		async (method) => {
			const response = await open(liveEnv(), "/", method);

			expect(response.status).toBe(405);
			expect(response.headers.get("allow")).toBe("GET, HEAD");
		},
	);

	it("answers HEAD on the page", async () => {
		const response = await open(liveEnv(), "/", "HEAD");

		expect(response.status).toBe(200);
	});

	it.each([
		["GET", "/"],
		["HEAD", "/"],
		["GET", "/?sync=1"],
		["GET", "/?cron=0+*/6+*+*+*"],
		["POST", "/?sync=1"],
		["GET", "/sync"],
		["POST", "/sync"],
		["GET", "/__scheduled"],
		["POST", "/__scheduled"],
	])("%s %s never reaches the search route", async (method, path) => {
		await open(liveEnv(), path, method);

		expect(searchRequests()).toEqual([]);
		expect(await storedOutcome()).toBeNull();
	});
});
