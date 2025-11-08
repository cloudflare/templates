// API endpoint for managing post tags
import type { APIRoute} from 'astro';
import { getPostTags, setPostTags, getAllTags } from '../../../../lib/db';
import { z } from 'zod';

const setTagsSchema = z.object({
	tags: z.array(z.string()),
});

// Get tags for a post
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

		const tags = await getPostTags(db, id);

		return new Response(JSON.stringify({ tags }), {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
			},
		});
	} catch (error) {
		console.error('Error getting post tags:', error);
		return new Response(
			JSON.stringify({ error: 'Failed to get tags' }),
			{
				status: 500,
				headers: {
					'Content-Type': 'application/json',
				},
			}
		);
	}
};

// Set tags for a post
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
		const validated = setTagsSchema.parse(body);

		await setPostTags(db, id, validated.tags);

		return new Response(JSON.stringify({ success: true }), {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
			},
		});
	} catch (error) {
		console.error('Error setting post tags:', error);
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
			JSON.stringify({ error: 'Failed to set tags' }),
			{
				status: 500,
				headers: {
					'Content-Type': 'application/json',
				},
			}
		);
	}
};
