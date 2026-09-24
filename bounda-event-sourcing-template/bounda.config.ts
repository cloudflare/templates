import { cloudflare } from "@bounda-dev/adapter-cloudflare";
import { defineConfig } from "@bounda-dev/core/config";

export default defineConfig({
	storage: cloudflare(),
});
