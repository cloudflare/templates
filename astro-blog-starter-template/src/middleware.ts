// Middleware to protect admin routes
import { defineMiddleware } from 'astro:middleware';
import { getUserFromSession } from './lib/auth';

export const onRequest = defineMiddleware(async ({ locals, cookies, url, redirect }, next) => {
	const db = locals.runtime?.env?.DB;

	// Protected routes
	const isAdminRoute = url.pathname.startsWith('/admin');
	const isApiRoute = url.pathname.startsWith('/api/posts') || url.pathname.startsWith('/api/drafts');
	const isAuthRoute = url.pathname.startsWith('/api/auth');

	// Allow auth routes without authentication
	if (isAuthRoute) {
		return next();
	}

	// Check authentication for protected routes
	if (isAdminRoute || isApiRoute) {
		if (!db) {
			return new Response('Database not available', { status: 500 });
		}

		const sessionId = cookies.get('session_id')?.value;

		if (!sessionId) {
			if (isAdminRoute) {
				// For admin pages, let them through - the page will handle showing login
				return next();
			}
			return new Response(JSON.stringify({ error: 'Unauthorized' }), {
				status: 401,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const user = await getUserFromSession(db, sessionId);

		if (!user) {
			// Invalid/expired session
			cookies.delete('session_id', { path: '/' });

			if (isAdminRoute) {
				// For admin pages, let them through - the page will handle showing login
				return next();
			}
			return new Response(JSON.stringify({ error: 'Unauthorized' }), {
				status: 401,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		// User is authenticated, attach to locals
		locals.user = user;
	}

	return next();
});
