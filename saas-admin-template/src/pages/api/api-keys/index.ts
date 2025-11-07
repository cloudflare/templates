import type { APIRoute } from "astro";
import { createAuth } from "../../../lib/auth";

export const GET: APIRoute = async ({ request, locals }) => {
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
		// Query all API keys for this user
		const result = await runtime.env.DB.prepare(
			`SELECT id, name, key, expiresAt, rateLimit, rateLimitWindow,
			        totalRequests, remainingRequests, lastUsedAt, createdAt, updatedAt
			 FROM apiKey
			 WHERE userId = ?
			 ORDER BY createdAt DESC`,
		)
			.bind(session.user.id)
			.all();

		return new Response(JSON.stringify({ apiKeys: result.results || [] }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		console.error("Error fetching API keys:", error);
		return new Response(
			JSON.stringify({ error: "Failed to fetch API keys" }),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}
};

export const POST: APIRoute = async ({ request, locals }) => {
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
		const body = await request.json();
		const { name, expiresIn, rateLimit } = body;

		if (!name || typeof name !== "string") {
			return new Response(JSON.stringify({ error: "Name is required" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}

		// Generate a secure API key using BetterAuth's API
		const createKeyResponse = await auth.api.createApiKey({
			body: {
				name,
				userId: session.user.id,
				expiresIn: expiresIn || 60 * 60 * 24 * 90, // Default 90 days
				rateLimit: rateLimit || 1000,
			},
			headers: request.headers,
		});

		if (!createKeyResponse) {
			return new Response(
				JSON.stringify({ error: "Failed to create API key" }),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		return new Response(
			JSON.stringify({ message: "API key created successfully", apiKey: createKeyResponse }),
			{
				status: 201,
				headers: { "Content-Type": "application/json" },
			},
		);
	} catch (error) {
		console.error("Error creating API key:", error);
		return new Response(
			JSON.stringify({ error: "Failed to create API key" }),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}
};
