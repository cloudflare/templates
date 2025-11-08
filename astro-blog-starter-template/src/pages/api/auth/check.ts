// API endpoint to check authentication status
import type { APIRoute } from 'astro';
import { getUserFromSession, hasUsers } from '../../../lib/auth';

export const GET: APIRoute = async ({ locals, cookies }) => {
	try {
		const db = locals.runtime.env.DB;

		// Check if registration is available
		const registrationOpen = !(await hasUsers(db));

		const sessionId = cookies.get('session_id')?.value;

		if (!sessionId) {
			return new Response(
				JSON.stringify({
					authenticated: false,
					registrationOpen
				}),
				{
					status: 200,
					headers: {
						'Content-Type': 'application/json',
					},
				}
			);
		}

		const user = await getUserFromSession(db, sessionId);

		if (!user) {
			// Invalid/expired session
			cookies.delete('session_id', { path: '/' });
			return new Response(
				JSON.stringify({
					authenticated: false,
					registrationOpen
				}),
				{
					status: 200,
					headers: {
						'Content-Type': 'application/json',
					},
				}
			);
		}

		// Don't return password hash
		const { password_hash, ...safeUser } = user;

		return new Response(
			JSON.stringify({
				authenticated: true,
				registrationOpen,
				user: safeUser
			}),
			{
				status: 200,
				headers: {
					'Content-Type': 'application/json',
				},
			}
		);
	} catch (error) {
		console.error('Error checking auth:', error);
		return new Response(
			JSON.stringify({
				authenticated: false,
				error: 'Failed to check authentication'
			}),
			{
				status: 500,
				headers: {
					'Content-Type': 'application/json',
				},
			}
		);
	}
};
