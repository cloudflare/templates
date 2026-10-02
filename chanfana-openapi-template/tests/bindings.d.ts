import type { D1Migration } from "cloudflare:test";

declare global {
	namespace Cloudflare {
		interface Env {
			MIGRATIONS: D1Migration[];
		}
	}
}

export {};
