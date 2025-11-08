// API endpoint for user logout
import type { APIRoute } from 'astro';
import { deleteSession } from '../../../lib/auth';

export const POST: APIRoute = async ({ locals, cookies }) => {
	try {
		const db = locals.runtime.env.DB;
		const sessionId = cookies.get('session_id')?.value;

		if (sessionId) {
			await deleteSession(db, sessionId);
		}

		// Clear cookie
		cookies.delete('session_id', {
			path: '/',
		});

		return new Response(
			JSON.stringify({ success: true }),
			{
				status: 200,
				headers: {
					'Content-Type': 'application/json',
				},
			}
		);
	} catch (error) {
		console.error('Error logging out:', error);
		return new Response(
			JSON.stringify({ error: 'Failed to log out' }),
			{
				status: 500,
				headers: {
					'Content-Type': 'application/json',
				},
			}
		);
	}
};
