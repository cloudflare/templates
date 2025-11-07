import type { APIRoute } from "astro";
import { createAuth } from "../../../lib/auth";

export const GET: APIRoute = async ({ params, request, locals }) => {
	const runtime = locals.runtime as {
		env: {
			DB: D1Database;
			AUTH_SECRET: string;
		};
	};

	if (!runtime?.env?.DB || !runtime?.env?.AUTH_SECRET) {
		return new Response(
			JSON.stringify({ error: "Server not properly configured" }),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	const url = new URL(request.url);
	const baseURL = `${url.protocol}//${url.host}`;
	const auth = createAuth(runtime.env.DB, baseURL, runtime.env.AUTH_SECRET);

	// Get the session from the request
	const session = await auth.api.getSession({ headers: request.headers });

	if (!session?.user) {
		return new Response(JSON.stringify({ error: "Unauthorized" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		});
	}

	try {
		const { id } = params;
		const result = await runtime.env.DB.prepare(
			`SELECT id, name, key, expiresAt, rateLimit, rateLimitWindow,
			        totalRequests, remainingRequests, lastUsedAt, createdAt, updatedAt
			 FROM apiKey
			 WHERE id = ? AND userId = ?`,
		)
			.bind(id, session.user.id)
			.first();

		if (!result) {
			return new Response(JSON.stringify({ error: "API key not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			});
		}

		return new Response(JSON.stringify({ apiKey: result }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		console.error("Error fetching API key:", error);
		return new Response(
			JSON.stringify({ error: "Failed to fetch API key" }),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}
};

export const DELETE: APIRoute = async ({ params, request, locals }) => {
	const runtime = locals.runtime as {
		env: {
			DB: D1Database;
			AUTH_SECRET: string;
		};
	};

	if (!runtime?.env?.DB || !runtime?.env?.AUTH_SECRET) {
		return new Response(
			JSON.stringify({ error: "Server not properly configured" }),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	const url = new URL(request.url);
	const baseURL = `${url.protocol}//${url.host}`;
	const auth = createAuth(runtime.env.DB, baseURL, runtime.env.AUTH_SECRET);

	// Get the session from the request
	const session = await auth.api.getSession({ headers: request.headers });

	if (!session?.user) {
		return new Response(JSON.stringify({ error: "Unauthorized" }), {
			status: 401,
			headers: { "Content-Type": "application/json" },
		});
	}

	try {
		const { id } = params;

		// First check if the API key belongs to the user
		const apiKey = await runtime.env.DB.prepare(
			`SELECT id FROM apiKey WHERE id = ? AND userId = ?`,
		)
			.bind(id, session.user.id)
			.first();

		if (!apiKey) {
			return new Response(JSON.stringify({ error: "API key not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			});
		}

		// Delete the API key
		await runtime.env.DB.prepare(`DELETE FROM apiKey WHERE id = ?`)
			.bind(id)
			.run();

		return new Response(
			JSON.stringify({ message: "API key deleted successfully" }),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			},
		);
	} catch (error) {
		console.error("Error deleting API key:", error);
		return new Response(
			JSON.stringify({ error: "Failed to delete API key" }),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}
};
