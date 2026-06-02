import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject({
	test: {
		testTimeout: 60000,
		poolOptions: {
			workers: {
				singleWorker: true,
				remoteBindings: false,
				wrangler: {
					configPath: "./wrangler.json",
				},
			},
		},
	},
});
