// API endpoint for user login
import type { APIRoute } from 'astro';
import { login } from '../../../lib/auth';
import { z } from 'zod';

const loginSchema = z.object({
	email: z.string().email(),
	password: z.string(),
});

export const POST: APIRoute = async ({ request, locals, cookies }) => {
	try {
		const db = locals.runtime.env.DB;
		const body = await request.json();

		// Validate input
		const validated = loginSchema.parse(body);

		// Attempt login
		const result = await login(db, validated.email, validated.password);

		if (!result) {
			return new Response(
				JSON.stringify({ error: 'Invalid email or password' }),
				{
					status: 401,
					headers: {
						'Content-Type': 'application/json',
					},
				}
			);
		}

		const { user, session } = result;

		// Set session cookie
		cookies.set('session_id', session.id, {
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			path: '/',
			maxAge: 30 * 24 * 60 * 60, // 30 days
		});

		// Don't return password hash
		const { password_hash, ...safeUser } = user;

		return new Response(
			JSON.stringify({ user: safeUser }),
			{
				status: 200,
				headers: {
					'Content-Type': 'application/json',
				},
			}
		);
	} catch (error) {
		console.error('Error logging in:', error);
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
			JSON.stringify({ error: 'Failed to log in' }),
			{
				status: 500,
				headers: {
					'Content-Type': 'application/json',
				},
			}
		);
	}
};
