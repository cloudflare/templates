import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.e2e.jsonc", environment: "e2e" },
      miniflare: { bindings: { DEMO_ACCESS_TOKEN: "" } }
    })
  ],
  test: { include: ["test/missing-config.integration.spec.ts"] }
});
