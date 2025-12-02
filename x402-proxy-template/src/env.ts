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
}

/** Full app context type for Hono */
export interface AppContext {
	Bindings: Env;
	Variables: {
		auth?: JWTPayload;
	};
}
