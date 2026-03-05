/**
 * Environment bindings type definition
 *
 * Extends the auto-generated CloudflareBindings with secrets that come from
 * .dev.vars locally or `wrangler secret put` in production.
 */

import type { JWTPayload } from "./jwt";

export interface Env extends CloudflareBindings {
	/** Secret for signing JWT tokens - set via .dev.vars locally or `wrangler secret put` in production */
	JWT_SECRET: string;
	/**
	 * Optional origin URL for External Origin mode.
	 * When set, requests are rewritten to this URL instead of using DNS-based routing.
	 * Use this to proxy to another Worker on a Custom Domain or any external service.
	 */
	ORIGIN_URL?: string;
	/** Optional: Service Binding to origin Worker */
	ORIGIN_SERVICE?: Fetcher;
}

/** Full app context type for Hono */
export interface AppContext {
	Bindings: Env;
	Variables: {
		auth?: JWTPayload;
	};
}
