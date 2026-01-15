import type { D1Migration } from "cloudflare:test";
import type { Env as AppEnv } from "../src/bindings";

export type Env = AppEnv & {
	MIGRATIONS: D1Migration[];
};

declare module "cloudflare:test" {
	interface ProvidedEnv extends Env {}
}
