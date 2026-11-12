import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";

import { cloudflare } from "@cloudflare/vite-plugin";

// https://vite.dev/config/
export default defineConfig({
	fmt: {
		printWidth: 80,
		useTabs: true,
		sortPackageJson: false,
		ignorePatterns: [
			"worker-configuration.d.ts",
			"env.d.ts",
			".react-router/**",
			".astro/**",
			".open-next/**",
			"build/**",
			"dist/**",
			"package-lock.json",
		],
	},
	lint: {
		ignorePatterns: [
			"worker-configuration.d.ts",
			"env.d.ts",
			".react-router/**",
			".astro/**",
			".open-next/**",
			"build/**",
			"dist/**",
		],
	},
	plugins: [react(), tailwindcss(), cloudflare()],
});
