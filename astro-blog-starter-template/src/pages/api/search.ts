// API endpoint for searching blog posts
import type { APIRoute } from 'astro';
import { listPosts, type BlogPost } from '../../lib/db';

export const GET: APIRoute = async ({ url, locals }) => {
	try {
		const db = locals.runtime.env.DB;
		const query = url.searchParams.get('q')?.trim().toLowerCase() || '';

		if (!query) {
			return new Response(
				JSON.stringify({ posts: [] }),
				{
					status: 200,
					headers: {
						'Content-Type': 'application/json',
					},
				}
			);
		}

		// Get all published posts
		const allPosts = await listPosts(db, { status: 'published' });

		// Simple search: filter by title, description, or content
		const results = allPosts.filter(post => {
			const titleMatch = post.title.toLowerCase().includes(query);
			const descMatch = post.description.toLowerCase().includes(query);
			const contentMatch = post.content.toLowerCase().includes(query);
			return titleMatch || descMatch || contentMatch;
		});

		return new Response(JSON.stringify({ posts: results }), {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
			},
		});
	} catch (error) {
		console.error('Error searching posts:', error);
		return new Response(
			JSON.stringify({ error: 'Failed to search posts' }),
			{
				status: 500,
				headers: {
					'Content-Type': 'application/json',
				},
			}
		);
	}
};
