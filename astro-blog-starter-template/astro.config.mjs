// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import react from "@astrojs/react";

import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
	site: "https://example.com",
	integrations: [mdx(), sitemap(), react()],
	adapter: cloudflare({
		platformProxy: {
			enabled: true,
		},
	}),
	output: "server", // Enable SSR for API routes and dynamic content
});
