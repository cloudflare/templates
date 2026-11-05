import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
	environments: {
		worker: { build: { sourcemap: true } },
	},
	optimizeDeps: {
		exclude: ["hono", "hono/cors"],
	},
	plugins: [
		react(),
		cloudflare({ viteEnvironment: { name: "worker" }, remoteBindings: false }),
	],
});
