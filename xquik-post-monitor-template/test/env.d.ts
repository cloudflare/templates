import type { D1Migration } from "cloudflare:test";
import type { Bindings } from "../src/index";

declare global {
	namespace Cloudflare {
		interface Env extends Bindings {
			MIGRATIONS: D1Migration[];
		}
	}
}

export {};
