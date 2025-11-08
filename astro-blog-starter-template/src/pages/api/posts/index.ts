// API endpoint for listing and creating posts
import type { APIRoute } from 'astro';
import { createPost, listPosts } from '../../../lib/db';
import { z } from 'zod';

const createPostSchema = z.object({
	title: z.string().min(1),
	description: z.string().min(1),
	content: z.string(),
	slug: z.string().optional(),
	hero_image: z.string().optional(),
	status: z.enum(['draft', 'published']).optional(),
	author: z.string().optional(),
});

export const GET: APIRoute = async ({ locals }) => {
	try {
		const db = locals.runtime.env.DB;
		const posts = await listPosts(db);

		return new Response(JSON.stringify({ posts }), {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
			},
		});
	} catch (error) {
		console.error('Error listing posts:', error);
		return new Response(
			JSON.stringify({ error: 'Failed to list posts' }),
			{
				status: 500,
				headers: {
					'Content-Type': 'application/json',
				},
			}
		);
	}
};

export const POST: APIRoute = async ({ request, locals }) => {
	try {
		const db = locals.runtime.env.DB;
		const body = await request.json();

		// Validate input
		const validated = createPostSchema.parse(body);

		// Create the post
		const post = await createPost(db, validated);

		return new Response(JSON.stringify({ post }), {
			status: 201,
			headers: {
				'Content-Type': 'application/json',
			},
		});
	} catch (error) {
		console.error('Error creating post:', error);
		if (error instanceof z.ZodError) {
			return new Response(
				JSON.stringify({ error: 'Invalid input', details: error.errors }),
				{
					status: 400,
					headers: {
						'Content-Type': 'application/json',
					},
				}
			);
		}
		return new Response(
			JSON.stringify({ error: 'Failed to create post' }),
			{
				status: 500,
				headers: {
					'Content-Type': 'application/json',
				},
			}
		);
	}
};
