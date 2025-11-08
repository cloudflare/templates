// Database utilities for blog posts
import { nanoid } from 'nanoid';

export interface BlogPost {
	id: string;
	title: string;
	description: string;
	content: string; // BlockNote JSON content
	html_content?: string | null; // Rendered HTML for display
	slug: string;
	hero_image?: string | null;
	pub_date: string; // ISO 8601 format
	updated_date?: string | null; // ISO 8601 format
	status: 'draft' | 'published';
	author?: string | null;
	created_at: string;
	updated_at: string;
}

export interface CreatePostInput {
	title: string;
	description: string;
	content: string;
	slug?: string;
	hero_image?: string;
	status?: 'draft' | 'published';
	author?: string;
}

export interface UpdatePostInput {
	title?: string;
	description?: string;
	content?: string;
	slug?: string;
	hero_image?: string;
	status?: 'draft' | 'published';
	pub_date?: string;
}

/**
 * Generate a URL-friendly slug from a title
 */
export function generateSlug(title: string): string {
	return title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

/**
 * Create a new blog post
 */
export async function createPost(
	db: D1Database,
	input: CreatePostInput
): Promise<BlogPost> {
	const id = nanoid();
	const slug = input.slug || generateSlug(input.title);
	const now = new Date().toISOString();

	const post: BlogPost = {
		id,
		title: input.title,
		description: input.description,
		content: input.content,
		html_content: null,
		slug,
		hero_image: input.hero_image || null,
		pub_date: now,
		updated_date: null,
		status: input.status || 'draft',
		author: input.author || null,
		created_at: now,
		updated_at: now,
	};

	await db
		.prepare(
			`INSERT INTO posts (id, title, description, content, html_content, slug, hero_image, pub_date, updated_date, status, author, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			post.id,
			post.title,
			post.description,
			post.content,
			post.html_content,
			post.slug,
			post.hero_image,
			post.pub_date,
			post.updated_date,
			post.status,
			post.author,
			post.created_at,
			post.updated_at
		)
		.run();

	return post;
}

/**
 * Get a post by ID
 */
export async function getPostById(
	db: D1Database,
	id: string
): Promise<BlogPost | null> {
	const result = await db
		.prepare('SELECT * FROM posts WHERE id = ?')
		.bind(id)
		.first<BlogPost>();
	return result;
}

/**
 * Get a post by slug
 */
export async function getPostBySlug(
	db: D1Database,
	slug: string
): Promise<BlogPost | null> {
	const result = await db
		.prepare('SELECT * FROM posts WHERE slug = ?')
		.bind(slug)
		.first<BlogPost>();
	return result;
}

/**
 * List all posts with optional filters
 */
export async function listPosts(
	db: D1Database,
	options: {
		status?: 'draft' | 'published';
		limit?: number;
		offset?: number;
	} = {}
): Promise<BlogPost[]> {
	let query = 'SELECT * FROM posts';
	const params: any[] = [];

	if (options.status) {
		query += ' WHERE status = ?';
		params.push(options.status);
	}

	query += ' ORDER BY pub_date DESC';

	if (options.limit) {
		query += ' LIMIT ?';
		params.push(options.limit);
	}

	if (options.offset) {
		query += ' OFFSET ?';
		params.push(options.offset);
	}

	const stmt = db.prepare(query);
	const result = await stmt.bind(...params).all<BlogPost>();
	return result.results || [];
}

/**
 * Update a post
 */
export async function updatePost(
	db: D1Database,
	id: string,
	updates: UpdatePostInput
): Promise<BlogPost | null> {
	const existing = await getPostById(db, id);
	if (!existing) return null;

	const updated: BlogPost = {
		...existing,
		...updates,
		updated_date: new Date().toISOString(),
		updated_at: new Date().toISOString(),
	};

	// If title changed and no slug provided, regenerate slug
	if (updates.title && !updates.slug) {
		updated.slug = generateSlug(updates.title);
	}

	await db
		.prepare(
			`UPDATE posts SET title = ?, description = ?, content = ?, html_content = ?, slug = ?, hero_image = ?, pub_date = ?, updated_date = ?, status = ?, updated_at = ?
       WHERE id = ?`
		)
		.bind(
			updated.title,
			updated.description,
			updated.content,
			updated.html_content,
			updated.slug,
			updated.hero_image,
			updated.pub_date,
			updated.updated_date,
			updated.status,
			updated.updated_at,
			id
		)
		.run();

	return updated;
}

/**
 * Delete a post
 */
export async function deletePost(db: D1Database, id: string): Promise<boolean> {
	const result = await db
		.prepare('DELETE FROM posts WHERE id = ?')
		.bind(id)
		.run();
	return result.success;
}

/**
 * Save a draft to KV (auto-save functionality)
 */
export async function saveDraft(
	kv: KVNamespace,
	postId: string,
	content: string
): Promise<void> {
	await kv.put(`draft:${postId}`, content, {
		expirationTtl: 86400 * 7, // 7 days
	});
}

/**
 * Get a draft from KV
 */
export async function getDraft(
	kv: KVNamespace,
	postId: string
): Promise<string | null> {
	return await kv.get(`draft:${postId}`);
}

/**
 * Delete a draft from KV
 */
export async function deleteDraft(
	kv: KVNamespace,
	postId: string
): Promise<void> {
	await kv.delete(`draft:${postId}`);
}

// ============================================================================
// Tag Management
// ============================================================================

/**
 * Add a tag to a post
 */
export async function addTagToPost(
	db: D1Database,
	postId: string,
	tag: string
): Promise<void> {
	await db
		.prepare('INSERT INTO post_tags (post_id, tag) VALUES (?, ?)')
		.bind(postId, tag.toLowerCase().trim())
		.run();
}

/**
 * Remove a tag from a post
 */
export async function removeTagFromPost(
	db: D1Database,
	postId: string,
	tag: string
): Promise<void> {
	await db
		.prepare('DELETE FROM post_tags WHERE post_id = ? AND tag = ?')
		.bind(postId, tag.toLowerCase().trim())
		.run();
}

/**
 * Get all tags for a post
 */
export async function getPostTags(db: D1Database, postId: string): Promise<string[]> {
	const result = await db
		.prepare('SELECT tag FROM post_tags WHERE post_id = ? ORDER BY tag')
		.bind(postId)
		.all<{ tag: string }>();
	return (result.results || []).map(r => r.tag);
}

/**
 * Set tags for a post (replaces all existing tags)
 */
export async function setPostTags(
	db: D1Database,
	postId: string,
	tags: string[]
): Promise<void> {
	// Remove all existing tags
	await db
		.prepare('DELETE FROM post_tags WHERE post_id = ?')
		.bind(postId)
		.run();

	// Add new tags
	for (const tag of tags) {
		if (tag.trim()) {
			await addTagToPost(db, postId, tag);
		}
	}
}

/**
 * Get all unique tags across all posts
 */
export async function getAllTags(db: D1Database): Promise<string[]> {
	const result = await db
		.prepare('SELECT DISTINCT tag FROM post_tags ORDER BY tag')
		.all<{ tag: string }>();
	return (result.results || []).map(r => r.tag);
}

/**
 * Get posts by tag
 */
export async function getPostsByTag(
	db: D1Database,
	tag: string,
	options: { limit?: number; offset?: number } = {}
): Promise<BlogPost[]> {
	let query = `
		SELECT p.* FROM posts p
		INNER JOIN post_tags pt ON p.id = pt.post_id
		WHERE pt.tag = ? AND p.status = 'published'
		ORDER BY p.pub_date DESC
	`;

	const params: any[] = [tag.toLowerCase().trim()];

	if (options.limit) {
		query += ' LIMIT ?';
		params.push(options.limit);
	}

	if (options.offset) {
		query += ' OFFSET ?';
		params.push(options.offset);
	}

	const stmt = db.prepare(query);
	const result = await stmt.bind(...params).all<BlogPost>();
	return result.results || [];
}
