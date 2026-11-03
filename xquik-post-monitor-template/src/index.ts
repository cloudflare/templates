import { renderPage, type Notice, type PageModel } from "./page";
import { SAMPLE_POSTS } from "./samples";
import {
	listPosts,
	newestPostId,
	readLastSync,
	saveSync,
	type LastSync,
} from "./store";
import { isKeyRejected, searchPosts } from "./xquik";

// wrangler types pins vars to their wrangler.json values & leaves out secrets.
export type Bindings = {
	DB: D1Database;
	XQUIK_API_KEY?: string;
	XQUIK_SEARCH_QUERY: string;
	XQUIK_SEARCH_LIMIT: number;
};

const HTML_HEADERS = {
	"content-type": "text/html; charset=utf-8",
	"content-security-policy":
		"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
	"x-content-type-options": "nosniff",
};

function readApiKey(env: Bindings): string | null {
	return env.XQUIK_API_KEY?.trim() || null;
}

async function pickNotice(
	apiKey: string,
	lastSync: LastSync | null,
): Promise<Notice | null> {
	if (lastSync === null || lastSync.outcome === "invalid_key") {
		return (await isKeyRejected(apiKey)) ? "invalid_key" : "sync_pending";
	}
	return lastSync.outcome === "ok" ? null : lastSync.outcome;
}

async function buildPageModel(env: Bindings): Promise<PageModel> {
	const query = env.XQUIK_SEARCH_QUERY;
	const apiKey = readApiKey(env);
	if (apiKey === null) {
		return {
			query,
			posts: SAMPLE_POSTS,
			sample: true,
			notice: "missing_key",
			lastSync: null,
		};
	}
	const [posts, lastSync] = await Promise.all([
		listPosts(env.DB, query),
		readLastSync(env.DB),
	]);
	const notice = await pickNotice(apiKey, lastSync);
	return { query, posts, sample: false, notice, lastSync };
}

export default {
	async fetch(request, env) {
		if (new URL(request.url).pathname !== "/") {
			return new Response("Not found", { status: 404 });
		}
		if (request.method !== "GET" && request.method !== "HEAD") {
			return new Response("Method not allowed", {
				status: 405,
				headers: { allow: "GET, HEAD" },
			});
		}
		const model = await buildPageModel(env);
		return new Response(renderPage(model), { headers: HTML_HEADERS });
	},

	async scheduled(controller, env) {
		const apiKey = readApiKey(env);
		if (apiKey === null) {
			console.log("Skipped the Xquik sync because XQUIK_API_KEY is not set");
			return;
		}
		const query = env.XQUIK_SEARCH_QUERY;
		const result = await searchPosts({
			apiKey,
			query,
			limit: env.XQUIK_SEARCH_LIMIT,
			sinceId: await newestPostId(env.DB, query),
		});
		const ranAt = new Date(controller.scheduledTime).toISOString();
		await saveSync(env.DB, query, result, ranAt);
		const log = result.outcome === "ok" ? console.log : console.error;
		log(`Xquik sync finished with outcome ${result.outcome}`);
	},
} satisfies ExportedHandler<Bindings>;
