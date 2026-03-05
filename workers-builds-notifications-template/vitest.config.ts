import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject({
	test: {
		poolOptions: {
			workers: {
				singleWorker: true,
				miniflare: {
					// Required to use `SELF.queue()`. This is an experimental
					// compatibility flag, and cannot be enabled in production.
					compatibilityFlags: ["service_binding_extra_handlers"],
					// Use a shorter `max_batch_timeout` in tests (50ms vs 30s)
					queueConsumers: {
						"builds-event-subscriptions": { maxBatchTimeout: 0.05 },
					},
					// Provide test bindings
					bindings: {
						SLACK_WEBHOOK_URL: "https://hooks.slack.com/test",
						CLOUDFLARE_API_TOKEN: "test-api-token",
					},
				},
				wrangler: {
					configPath: "./wrangler.jsonc",
				},
			},
		},
	},
});
