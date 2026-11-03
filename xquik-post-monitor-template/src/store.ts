import type { Post, SearchResult, SyncOutcome } from "./xquik";

export type LastSync = { outcome: SyncOutcome; ranAt: string };

const LISTED_POSTS = 50;

export async function newestPostId(
	db: D1Database,
	query: string,
): Promise<string | null> {
	return db
		.prepare(
			"SELECT id FROM posts WHERE query = ? ORDER BY CAST(id AS INTEGER) DESC LIMIT 1",
		)
		.bind(query)
		.first<string>("id");
}

export async function listPosts(
	db: D1Database,
	query: string,
): Promise<Post[]> {
	const { results } = await db
		.prepare(
			`SELECT
				id,
				text,
				author_username AS authorUsername,
				author_name AS authorName,
				created_at AS createdAt,
				like_count AS likeCount,
				repost_count AS repostCount,
				reply_count AS replyCount
			FROM posts
			WHERE query = ?
			ORDER BY CAST(id AS INTEGER) DESC
			LIMIT ?`,
		)
		.bind(query, LISTED_POSTS)
		.all<Post>();
	return results;
}

export async function readLastSync(db: D1Database): Promise<LastSync | null> {
	return db
		.prepare("SELECT outcome, ran_at AS ranAt FROM sync_status WHERE id = 1")
		.first<LastSync>();
}

export async function saveSync(
	db: D1Database,
	query: string,
	result: SearchResult,
	ranAt: string,
): Promise<void> {
	const posts = result.outcome === "ok" ? result.posts : [];
	const insertPost = db.prepare(
		`INSERT OR IGNORE INTO posts (
			query,
			id,
			text,
			author_username,
			author_name,
			created_at,
			like_count,
			repost_count,
			reply_count,
			fetched_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	);
	const upsertStatus = db.prepare(
		`INSERT INTO sync_status (id, outcome, ran_at) VALUES (1, ?, ?)
		ON CONFLICT (id) DO UPDATE SET
			outcome = excluded.outcome,
			ran_at = excluded.ran_at`,
	);

	await db.batch([
		...posts.map((post) =>
			insertPost.bind(
				query,
				post.id,
				post.text,
				post.authorUsername,
				post.authorName,
				post.createdAt,
				post.likeCount,
				post.repostCount,
				post.replyCount,
				ranAt,
			),
		),
		upsertStatus.bind(result.outcome, ranAt),
	]);
}
