import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    include: ["test/**/*.test.ts"],
    poolOptions: {
      singleWorker: true,
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
      },
    },
  },
});
