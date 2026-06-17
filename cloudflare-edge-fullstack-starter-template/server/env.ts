/// <reference types="@cloudflare/workers-types" />

// The only things baked into the deployed Worker. The three storage bindings
// are auto-provisioned by the Deploy button; BETTER_AUTH_SECRET is the one
// secret you supply (prompted at deploy time, or in .dev.vars locally).
export type Bindings = {
	/** Static assets — the built React SPA. */
	ASSETS: Fetcher;
	/** D1 — app data (notes) + auth tables (user / account / verification). */
	DB: D1Database;
	/** KV — session storage (the only place sessions live). */
	SESSIONS: KVNamespace;
	/** R2 — uploaded files. */
	BUCKET: R2Bucket;
	/** Signs session tokens. Set via `wrangler secret put` / the deploy prompt. */
	BETTER_AUTH_SECRET: string;
};

export type AppUser = { id: string; email: string; name: string | null };

export type AppEnv = {
	Bindings: Bindings;
	Variables: { user: AppUser };
};
