// API endpoint for draft auto-save functionality
import type { APIRoute } from 'astro';
import { saveDraft, getDraft, deleteDraft } from '../../../lib/db';

export const GET: APIRoute = async ({ params, locals }) => {
	try {
		const kv = locals.runtime.env.DRAFTS;
		const { postId } = params;

		if (!postId) {
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

		const draft = await getDraft(kv, postId);

		return new Response(JSON.stringify({ draft }), {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
			},
		});
	} catch (error) {
		console.error('Error getting draft:', error);
		return new Response(
			JSON.stringify({ error: 'Failed to get draft' }),
			{
				status: 500,
				headers: {
					'Content-Type': 'application/json',
				},
			}
		);
	}
};

export const POST: APIRoute = async ({ params, request, locals }) => {
	try {
		const kv = locals.runtime.env.DRAFTS;
		const { postId } = params;

		if (!postId) {
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
		const { content } = body;

		if (typeof content !== 'string') {
			return new Response(
				JSON.stringify({ error: 'Content must be a string' }),
				{
					status: 400,
					headers: {
						'Content-Type': 'application/json',
					},
				}
			);
		}

		await saveDraft(kv, postId, content);

		return new Response(JSON.stringify({ success: true }), {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
			},
		});
	} catch (error) {
		console.error('Error saving draft:', error);
		return new Response(
			JSON.stringify({ error: 'Failed to save draft' }),
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
		const kv = locals.runtime.env.DRAFTS;
		const { postId } = params;

		if (!postId) {
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

		await deleteDraft(kv, postId);

		return new Response(JSON.stringify({ success: true }), {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
			},
		});
	} catch (error) {
		console.error('Error deleting draft:', error);
		return new Response(
			JSON.stringify({ error: 'Failed to delete draft' }),
			{
				status: 500,
				headers: {
					'Content-Type': 'application/json',
				},
			}
		);
	}
};
