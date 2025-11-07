import type { APIRoute } from "astro";
import { createAuth } from "../../../lib/auth";

export const ALL: APIRoute = async ({ request, locals }) => {
	const runtime = locals.runtime as {
		env: {
			DB: D1Database;
			AUTH_SECRET: string;
		};
	};

	if (!runtime?.env?.DB) {
		return new Response(
			JSON.stringify({ error: "Database not configured" }),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	if (!runtime?.env?.AUTH_SECRET) {
		return new Response(
			JSON.stringify({ error: "AUTH_SECRET not configured" }),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	const url = new URL(request.url);
	const baseURL = `${url.protocol}//${url.host}`;

	const auth = createAuth(runtime.env.DB, baseURL, runtime.env.AUTH_SECRET);

	return auth.handler(request);
};
