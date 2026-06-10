import type { Env } from "../src/lib/types";

// Type the bindings available via `env` from "cloudflare:test".
declare module "cloudflare:test" {
	interface ProvidedEnv extends Env {}
}
