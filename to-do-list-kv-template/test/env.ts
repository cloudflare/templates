declare module "cloudflare:test" {
	export const env: ProvidedEnv;
	interface ProvidedEnv extends Env {}
}
