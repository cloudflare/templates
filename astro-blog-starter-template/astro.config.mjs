// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";

import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
	site: "https://example.com",
	integrations: [
		{
			name: "worker-source-maps",
			hooks: {
				"astro:build:setup": ({ target, vite }) => {
					if (target === "server") {
						vite.build ??= {};
						vite.build.sourcemap = true;
					}
				},
			},
		},
		mdx(),
		sitemap(),
	],
	adapter: cloudflare({
		platformProxy: {
			enabled: true,
		},
	}),
});
