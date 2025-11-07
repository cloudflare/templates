import { betterAuth } from "better-auth";
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
		advanced: {
			generateId: false, // Use database auto-increment
		},
	});
}

export type Auth = ReturnType<typeof createAuth>;
