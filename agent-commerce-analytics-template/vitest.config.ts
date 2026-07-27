import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject({
	test: {
		testTimeout: 60000,
		poolOptions: {
			workers: {
				singleWorker: true,
				wrangler: {
					configPath: "./wrangler.jsonc",
				},
				miniflare: {
					// Enable the destructive DELETE /api/events endpoint for tests.
					// In production this is set with `wrangler secret put ADMIN_TOKEN`
					// and omitted from wrangler.jsonc.
					bindings: {
						ADMIN_TOKEN: "test-admin-token",
					},
				},
			},
		},
	},
});
