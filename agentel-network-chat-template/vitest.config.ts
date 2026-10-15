import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.e2e.jsonc", environment: "e2e" }
    })
  ],
  test: { include: ["test/worker.integration.spec.ts"] }
});
