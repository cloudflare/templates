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
