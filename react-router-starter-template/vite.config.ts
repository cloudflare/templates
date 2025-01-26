import autoprefixer from "autoprefixer";
import tailwindcss from "tailwindcss";
import tsconfigPaths from "vite-tsconfig-paths";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

// By default react-router's dev server uses Node.js, so we want to remove their server
// configuration to use the dev server provided by Vite + Workerd.
const reactRouterPlugins = reactRouter();
const reactRouterPlugin = reactRouterPlugins.find(
  (plugin) => plugin.name === "react-router",
)!;
reactRouterPlugin.configureServer = undefined;

export default defineConfig({
  css: {
    postcss: {
      plugins: [tailwindcss, autoprefixer],
    },
  },
  plugins: [cloudflare(), reactRouterPlugins, tsconfigPaths()],
  ssr: {
    resolve: {
      conditions: ["workerd", "worker", "browser"],
    },
  },
  resolve: {
    mainFields: ["browser", "module", "main"],
  },
  build: {
    minify: true,
  },
});
