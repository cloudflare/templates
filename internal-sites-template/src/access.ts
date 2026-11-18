/**
 * Cloudflare Access identity helpers and routing mode detection.
 *
 * Auth model:
 *   - ctx.access is populated automatically by the Workers runtime when
 *     Cloudflare Access authenticates a request. No manual JWT verification
 *     or environment secrets are needed.
 *   - In local development, `wrangler dev` simulates ctx.access using the
 *     `access.dev` block in wrangler.jsonc.
 *
 * Routing mode (separate from auth) is auto-detected:
 *   - workers.dev / localhost / placeholder domain → path-based routing (/sites/slug/)
 *   - Real custom domain                          → subdomain routing (slug.company.com)
 */

import type { ExecutionContext } from "hono";
import type { Env } from "./env";

export interface AccessIdentity {
	email: string;
	userId?: string;
}

const DEFAULT_PLACEHOLDER_DOMAIN = "internal-company.com";

// ── Routing mode detection ───────────────────────────────────────────────────

/**
 * Detect whether path-based routing should be used.
 *
 * Path-based routing is active when:
 *   - The request hostname ends with `.workers.dev`
 *   - The request hostname is `localhost` (wrangler dev)
 *   - SITE_DOMAIN is empty or still the default placeholder
 *
 * This is separate from auth — workers.dev uses path-based routing but
 * still requires Access authentication for platform and deployed-site routes.
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

// ── Public auth API ──────────────────────────────────────────────────────────

function toAccessIdentity(
	identity: CloudflareAccessIdentity | undefined,
): AccessIdentity {
	return {
		email: identity?.email ?? "unknown",
		userId: identity?.user_uuid,
	};
}

/**
 * Extract the verified identity from the execution context.
 *
 * ctx.access is populated by the Workers runtime when Cloudflare Access
 * authenticates the request. Returns null if Access did not run.
 */
export async function getAccessIdentity(
	ctx: ExecutionContext,
): Promise<AccessIdentity | null> {
	if (!ctx.access) {
		return null;
	}

	try {
		return toAccessIdentity(await ctx.access.getIdentity());
	} catch {
		return null;
	}
}

/**
 * Require a verified identity. Returns the identity or a 401 Response.
 *
 * ctx.access is defined when Cloudflare Access has authenticated the request.
 * If ctx.access is undefined, Access is not enabled on this Worker.
 */
export async function requireAccessIdentity(
	ctx: ExecutionContext,
): Promise<AccessIdentity | Response> {
	if (!ctx.access) {
		return new Response(
			"Setup required: Enable Cloudflare Access\n\n" +
				"This Worker is not protected by Cloudflare Access.\n\n" +
				"To enable Access:\n" +
				"1. Open Workers & Pages: https://dash.cloudflare.com/?to=/:account/workers-and-pages\n" +
				"2. Select this Worker and open the Access tab.\n" +
				'3. Select "Protect this Worker behind Access."\n' +
				'4. Choose "All traffic," add an Allow policy for your company, and select "Apply Access."\n' +
				"5. Reload this page and sign in.\n\n" +
				"If Access is already enabled, confirm that it covers this hostname and path.",
			{
				status: 401,
				headers: { "Content-Type": "text/plain; charset=utf-8" },
			},
		);
	}

	try {
		return toAccessIdentity(await ctx.access.getIdentity());
	} catch (error) {
		const detail = error instanceof Error ? error.message : "Unknown error";
		return new Response(
			"Could not read your Access identity.\n\n" +
				"Reload this page and sign in again.\n\n" +
				`Technical details: ${detail}`,
			{
				status: 401,
				headers: { "Content-Type": "text/plain; charset=utf-8" },
			},
		);
	}
}
