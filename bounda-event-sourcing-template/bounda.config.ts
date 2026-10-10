import { cloudflare } from "@bounda-dev/cloudflare";
import { defineConfig } from "@bounda-dev/core/config";

export default defineConfig({
	storage: cloudflare(),
});
