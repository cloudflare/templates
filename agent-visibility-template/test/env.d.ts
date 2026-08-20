import type { Env as WorkerEnv } from "../src/lib/types";

declare global {
	namespace Cloudflare {
		interface Env extends WorkerEnv {}
	}
}

export {};
