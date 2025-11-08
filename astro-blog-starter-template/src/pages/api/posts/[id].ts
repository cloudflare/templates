// API endpoint for getting, updating, and deleting individual posts
import type { APIRoute } from 'astro';
import { getPostById, updatePost, deletePost } from '../../../lib/db';
import { z } from 'zod';

const updatePostSchema = z.object({
	title: z.string().min(1).optional(),
	description: z.string().min(1).optional(),
	content: z.string().optional(),
	slug: z.string().optional(),
	hero_image: z.string().optional(),
	status: z.enum(['draft', 'published']).optional(),
	pub_date: z.string().optional(),
});

export const GET: APIRoute = async ({ params, locals }) => {
	try {
		const db = locals.runtime.env.DB;
		const { id } = params;

		if (!id) {
			return new Response(
				JSON.stringify({ error: 'Post ID is required' }),
				{
					status: 400,
					headers: {
						'Content-Type': 'application/json',
					},
				}
			);
		}

		const post = await getPostById(db, id);

		if (!post) {
			return new Response(
				JSON.stringify({ error: 'Post not found' }),
				{
					status: 404,
					headers: {
						'Content-Type': 'application/json',
					},
				}
			);
		}

		return new Response(JSON.stringify({ post }), {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
			},
		});
	} catch (error) {
		console.error('Error getting post:', error);
		return new Response(
			JSON.stringify({ error: 'Failed to get post' }),
			{
				status: 500,
				headers: {
					'Content-Type': 'application/json',
				},
			}
		);
	}
};

export const PUT: APIRoute = async ({ params, request, locals }) => {
	try {
		const db = locals.runtime.env.DB;
		const { id } = params;

		if (!id) {
			return new Response(
				JSON.stringify({ error: 'Post ID is required' }),
				{
					status: 400,
					headers: {
						'Content-Type': 'application/json',
					},
				}
			);
		}

		const body = await request.json();

		// Validate input
		const validated = updatePostSchema.parse(body);

		// Update the post
		const post = await updatePost(db, id, validated);

		if (!post) {
			return new Response(
				JSON.stringify({ error: 'Post not found' }),
				{
					status: 404,
					headers: {
						'Content-Type': 'application/json',
					},
				}
			);
		}

		return new Response(JSON.stringify({ post }), {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
			},
		});
	} catch (error) {
		console.error('Error updating post:', error);
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
			JSON.stringify({ error: 'Failed to update post' }),
			{
				status: 500,
				headers: {
					'Content-Type': 'application/json',
				},
			}
		);
	}
};

export const DELETE: APIRoute = async ({ params, locals }) => {
	try {
		const db = locals.runtime.env.DB;
		const { id } = params;

		if (!id) {
			return new Response(
				JSON.stringify({ error: 'Post ID is required' }),
				{
					status: 400,
					headers: {
						'Content-Type': 'application/json',
					},
				}
			);
		}

		const success = await deletePost(db, id);

		if (!success) {
			return new Response(
				JSON.stringify({ error: 'Post not found' }),
				{
					status: 404,
					headers: {
						'Content-Type': 'application/json',
					},
				}
			);
		}

		return new Response(JSON.stringify({ success: true }), {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
			},
		});
	} catch (error) {
		console.error('Error deleting post:', error);
		return new Response(
			JSON.stringify({ error: 'Failed to delete post' }),
			{
				status: 500,
				headers: {
					'Content-Type': 'application/json',
				},
			}
		);
	}
};
