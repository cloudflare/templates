import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
	test: {
		exclude: ["playwright-tests/**", "node_modules/**"],
		poolOptions: {
			workers: {
				remoteBindings: false,
				wrangler: {
					configPath: "./wrangler.jsonc",
				},
			},
		},
	},
});
