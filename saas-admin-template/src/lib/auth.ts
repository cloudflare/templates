import { betterAuth } from "better-auth";
import { apiKey } from "better-auth/plugins";
import { Kysely } from "kysely";
import { D1Dialect } from "kysely-d1";

export function createAuth(db: D1Database, baseURL: string, secret: string) {
	const kysely = new Kysely({
		dialect: new D1Dialect({ database: db }),
	});

	return betterAuth({
		database: kysely,
		databaseType: "sqlite",
		baseURL,
		secret,
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: false, // Set to true in production with email service
		},
		socialProviders: {
			google: {
				clientId: process.env.GOOGLE_CLIENT_ID || "",
				clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
				enabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
			},
		},
		session: {
			expiresIn: 60 * 60 * 24 * 7, // 7 days
			updateAge: 60 * 60 * 24, // 1 day (session extends after this period)
			cookieCache: {
				enabled: true,
				maxAge: 5 * 60, // 5 minutes
			},
		},
		plugins: [
			apiKey({
				// Default rate limit: 1000 requests per day (can be overridden per key)
				rateLimit: {
					window: 60 * 60 * 24, // 24 hours in seconds
					max: 1000, // 1000 requests per day
				},
				// Keys expire after 90 days by default (can be overridden per key)
				expiresIn: 60 * 60 * 24 * 90, // 90 days in seconds
			}),
		],
		advanced: {
			generateId: false, // Use database auto-increment
		},
	});
}

export type Auth = ReturnType<typeof createAuth>;
