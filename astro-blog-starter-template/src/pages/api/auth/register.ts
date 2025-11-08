// API endpoint for user registration (one-time only)
import type { APIRoute } from 'astro';
import { createUser, hasUsers } from '../../../lib/auth';
import { z } from 'zod';

const registerSchema = z.object({
	email: z.string().email(),
	password: z.string().min(8),
	name: z.string().optional(),
});

export const POST: APIRoute = async ({ request, locals }) => {
	try {
		const db = locals.runtime.env.DB;
		const body = await request.json();

		// Validate input
		const validated = registerSchema.parse(body);

		// Check if registration is still available
		if (await hasUsers(db)) {
			return new Response(
				JSON.stringify({
					error: 'Registration is closed. An admin account already exists.'
				}),
				{
					status: 403,
					headers: {
						'Content-Type': 'application/json',
					},
				}
			);
		}

		// Create the first (and only) user
		const user = await createUser(
			db,
			validated.email,
			validated.password,
			validated.name
		);

		if (!user) {
			return new Response(
				JSON.stringify({ error: 'Failed to create user' }),
				{
					status: 500,
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
				user: safeUser,
				message: 'Admin account created successfully. Please log in.'
			}),
			{
				status: 201,
				headers: {
					'Content-Type': 'application/json',
				},
			}
		);
	} catch (error) {
		console.error('Error registering user:', error);
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
			JSON.stringify({ error: 'Failed to register user' }),
			{
				status: 500,
				headers: {
					'Content-Type': 'application/json',
				},
			}
		);
	}
};
