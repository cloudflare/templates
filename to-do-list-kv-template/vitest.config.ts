import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
	test: {
		deps: {
			optimizer: {
				ssr: {
					include: ["@remix-run/cloudflare"],
				},
			},
		},
		include: ["test/**/*.test.ts"],
		poolOptions: {
			singleWorker: true,
			workers: {
				wrangler: { configPath: "./wrangler.jsonc" },
			},
		},
	},
});
