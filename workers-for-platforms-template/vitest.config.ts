import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
	test: {
		poolOptions: {
			workers: {
				wrangler: { configPath: "./wrangler.jsonc" },
				miniflare: {
					// Mock bindings for testing
					d1Databases: ["DB"],
					bindings: {
						DISPATCH_NAMESPACE_NAME: "test-namespace",
						CUSTOM_DOMAIN: "",
					},
				},
			},
		},
	},
});
