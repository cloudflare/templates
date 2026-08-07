/**
 * Cloudflare Access identity helpers and routing mode detection.
 *
 * Routing mode is auto-detected from the request hostname and SITE_DOMAIN:
 *   - workers.dev / localhost / placeholder domain --> testing mode (path-based routing)
 *   - Real custom domain --> production mode (subdomain routing + Access required)
 */

import type { Env } from "./env";

export interface AccessIdentity {
	email: string;
	userId?: string;
}

const EMAIL_HEADER = "Cf-Access-Authenticated-User-Email";
const USER_ID_HEADER = "Cf-Access-Authenticated-User-Id";

const DEFAULT_PLACEHOLDER_DOMAIN = "internal-company.com";

/**
 * Detect whether the platform is running in testing mode.
 *
 * Testing mode is active when:
 *   - The request hostname ends with `.workers.dev`
 *   - The request hostname is `localhost` (wrangler dev)
 *   - SITE_DOMAIN is empty or still the default placeholder
 *
 * In testing mode, path-based routing is used (/sites/slug/) and
 * Access authentication is not required.
 */
export function isTestingMode(request: Request, env: Env): boolean {
	const hostname = new URL(request.url).hostname;
	const domain = (env.SITE_DOMAIN || "").trim();

	return (
		hostname.endsWith(".workers.dev") ||
		hostname === "localhost" ||
		hostname.startsWith("127.") ||
		domain === "" ||
		domain === DEFAULT_PLACEHOLDER_DOMAIN
	);
}

/**
 * Extract the Cloudflare Access identity from request headers.
 *
 * In testing mode (workers.dev / localhost), returns a placeholder
 * identity when no Access headers are present.
 */
export function getAccessIdentity(
	request: Request,
	env: Env,
): AccessIdentity | null {
	const email = request.headers.get(EMAIL_HEADER);
	const userId = request.headers.get(USER_ID_HEADER) || undefined;

	if (email) {
		return { email, userId };
	}

	// In testing mode, allow access with a placeholder identity
	if (isTestingMode(request, env)) {
		return { email: "setup@workers.dev" };
	}

	return null;
}

/**
 * Require a valid identity. Returns the identity or a 401 Response.
 *
 * - If Access headers are present: returns the real identity
 * - If on workers.dev/localhost: returns a placeholder identity
 * - If on a custom domain without Access: returns 401
 */
export function requireAccessIdentity(
	request: Request,
	env: Env,
): AccessIdentity | Response {
	const identity = getAccessIdentity(request, env);

	if (identity) {
		return identity;
	}

	return new Response(
		"Company sign-in is required to use this site.\n\n" +
			"Cloudflare Access is not configured for this Worker.\n" +
			"See the README for instructions on creating an Access application.",
		{
			status: 401,
			headers: { "Content-Type": "text/plain; charset=utf-8" },
		},
	);
}
