// API endpoint for getting all tags
import type { APIRoute } from 'astro';
import { getAllTags } from '../../../lib/db';

export const GET: APIRoute = async ({ locals }) => {
	try {
		const db = locals.runtime.env.DB;
		const tags = await getAllTags(db);

		return new Response(JSON.stringify({ tags }), {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
			},
		});
	} catch (error) {
		console.error('Error getting tags:', error);
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
