// Utilities for combining static and dynamic blog posts
import { getCollection, type CollectionEntry } from 'astro:content';
import { listPosts, type BlogPost } from './db';

export interface UnifiedPost {
	id: string;
	slug: string;
	data: {
		title: string;
		description: string;
		pubDate: Date;
		updatedDate?: Date;
		heroImage?: string;
	};
	body?: string;
	content?: string; // BlockNote JSON
	source: 'static' | 'dynamic';
}

/**
 * Convert a D1 blog post to the unified format
 */
export function dbPostToUnified(post: BlogPost): UnifiedPost {
	return {
		id: post.slug,
		slug: post.slug,
		data: {
			title: post.title,
			description: post.description,
			pubDate: new Date(post.pub_date),
			updatedDate: post.updated_date ? new Date(post.updated_date) : undefined,
			heroImage: post.hero_image || undefined,
		},
		content: post.content,
		source: 'dynamic',
	};
}

/**
 * Convert a static content collection entry to unified format
 */
export function staticPostToUnified(post: CollectionEntry<'blog'>): UnifiedPost {
	return {
		id: post.id,
		slug: post.id,
		data: post.data,
		body: post.body,
		source: 'static',
	};
}

/**
 * Get all published posts (both static and dynamic)
 */
export async function getAllPublishedPosts(
	runtime?: { env: { DB: D1Database } }
): Promise<UnifiedPost[]> {
	const posts: UnifiedPost[] = [];

	// Get static posts from content collection
	try {
		const staticPosts = await getCollection('blog');
		posts.push(...staticPosts.map(staticPostToUnified));
	} catch (error) {
		console.error('Error loading static posts:', error);
	}

	// Get dynamic posts from D1 (only published)
	if (runtime?.env?.DB) {
		try {
			const dbPosts = await listPosts(runtime.env.DB, { status: 'published' });
			posts.push(...dbPosts.map(dbPostToUnified));
		} catch (error) {
			console.error('Error loading dynamic posts:', error);
		}
	}

	// Sort by publication date (newest first)
	return posts.sort((a, b) =>
		b.data.pubDate.getTime() - a.data.pubDate.getTime()
	);
}

/**
 * Get a post by slug (checks both static and dynamic)
 */
export async function getPostBySlug(
	slug: string,
	runtime?: { env: { DB: D1Database } }
): Promise<UnifiedPost | null> {
	// Try static posts first
	try {
		const staticPosts = await getCollection('blog');
		const staticPost = staticPosts.find(p => p.id === slug);
		if (staticPost) {
			return staticPostToUnified(staticPost);
		}
	} catch (error) {
		console.error('Error loading static post:', error);
	}

	// Try dynamic posts from D1
	if (runtime?.env?.DB) {
		try {
			const { getPostBySlug: getDbPost } = await import('./db');
			const dbPost = await getDbPost(runtime.env.DB, slug);
			if (dbPost && dbPost.status === 'published') {
				return dbPostToUnified(dbPost);
			}
		} catch (error) {
			console.error('Error loading dynamic post:', error);
		}
	}

	return null;
}

/**
 * Render BlockNote content to HTML
 * For now, this is a simple JSON stringify - you can enhance this
 * to properly render BlockNote blocks to HTML
 */
export function renderBlockNoteToHTML(content: string): string {
	try {
		const blocks = JSON.parse(content);
		// Simple rendering - you can enhance this with proper BlockNote HTML rendering
		return blocks.map((block: any) => {
			if (block.type === 'paragraph') {
				const text = block.content?.map((c: any) => c.text || '').join('') || '';
				return `<p>${text}</p>`;
			}
			if (block.type === 'heading') {
				const level = block.props?.level || 1;
				const text = block.content?.map((c: any) => c.text || '').join('') || '';
				return `<h${level}>${text}</h${level}>`;
			}
			// Add more block types as needed
			return '';
		}).join('\n');
	} catch (error) {
		console.error('Error rendering BlockNote content:', error);
		return '<p>Error rendering content</p>';
	}
}
