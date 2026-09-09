import { cors } from "hono/cors";
import type { MiddlewareHandler } from "hono";

const ALLOWED_HEADERS = ["Content-Type", "Authorization"];

export function corsFromEnv(allowedOrigins: string): MiddlewareHandler {
	if (allowedOrigins.trim() === "*") {
		return cors({ origin: "*", allowHeaders: ALLOWED_HEADERS });
	}
	const allowlist = allowedOrigins
		.split(",")
		.map((origin) => origin.trim())
		.filter(Boolean);
	return cors({
		origin: (origin) => (allowlist.includes(origin) ? origin : undefined),
		allowHeaders: ALLOWED_HEADERS,
	});
}
