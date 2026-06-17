import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

// The Cloudflare plugin runs the Worker (server/index.ts) in Miniflare with
// local emulated D1 / KV / R2, and serves the React SPA on the same origin —
// so `npm run dev` is a faithful local copy of production with zero setup.
//
// No HTTPS/mkcert needed: auth here is same-origin (SPA + API on one Worker),
// so the session cookie is first-party and is NOT marked Secure over
// http://localhost — every browser stores it, including Safari.
export default defineConfig({
	plugins: [react(), tailwindcss(), cloudflare()],
	server: {
		port: 5173,
		strictPort: true,
	},
});
