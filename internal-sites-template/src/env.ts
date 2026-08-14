/**
 * Environment bindings for the Internal Sites Platform Worker.
 *
 * Defined in wrangler.jsonc and provisioned during deploy.
 */
export interface Env {
	// ── Bindings ──────────────────────────────────────────────────────────────

	/** Workers for Platforms dispatch namespace. Routes requests to deployed sites. */
	dispatcher: Dispatcher;

	/** D1 database storing site metadata, deployments, and ACLs. */
	DB: D1Database;

	// ── Secrets ──────────────────────────────────────────────────────────────

	/** API token with Workers Scripts:Edit permission for deploying into the dispatch namespace. */
	DISPATCH_NAMESPACE_API_TOKEN: string;

	// ── Variables ────────────────────────────────────────────────────────────

	/** Cloudflare account ID (written into wrangler.jsonc by setup script during build). */
	ACCOUNT_ID: string;

	/** Name of the dispatch namespace (must match wrangler.jsonc). */
	DISPATCH_NAMESPACE_NAME: string;

	/** Company domain for site URLs, e.g. "internal-company.com". */
	SITE_DOMAIN: string;

	/** Path where the deploy UI is served. Defaults to "/deploy". */
	DEPLOY_PATH?: string;

	// ── Access JWT verification (required outside local development) ──────────

	/**
	 * Cloudflare One team domain, e.g. "https://mycompany.cloudflareaccess.com".
	 * Required for JWT verification on non-localhost environments.
	 * Found in Zero Trust > Settings > Custom Pages.
	 */
	ACCESS_TEAM_DOMAIN?: string;

	/**
	 * Application Audience (AUD) Tag from the Access application.
	 * Required outside local development so JWT verification checks that the
	 * token was issued for this specific application.
	 * Found in Zero Trust > Access > Applications > your app > Additional settings.
	 */
	ACCESS_AUD?: string;
}

// ── Workers for Platforms types ──────────────────────────────────────────────

interface Dispatcher {
	get(
		scriptName: string,
		args?: Record<string, unknown>,
		options?: {
			limits?: { cpuMs?: number; memory?: number };
			outbound?: string;
		},
	): DispatchedWorker;
}

interface DispatchedWorker {
	fetch(request: Request): Promise<Response>;
}
