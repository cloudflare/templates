import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject({
	test: {
		testTimeout: 60000,
		poolOptions: {
			workers: {
				singleWorker: true,
				remoteBindings: false,
				wrangler: {
					configPath: "./wrangler.jsonc",
				},
				miniflare: {
					// Provide the admin secret for the mutating-route tests.
					bindings: { ADMIN_TOKEN: "test-token" },
				},
			},
		},
	},
});
