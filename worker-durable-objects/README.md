# 👷 Durable Objects template

## Note: You must use [wrangler](https://developers.cloudflare.com/workers/cli-wrangler/install-update) 1.19.3 or newer to use this template.

## Please read the [Durable Object documentation](https://developers.cloudflare.com/workers/learning/using-durable-objects) before using this template.

A template for kick-starting a Cloudflare Workers project that uses Durable Objects.

This template is meant to be the simplest way to get started with Durable Objects, for developers who just want to be able to write some code without worrying about a JavaScript bundler. If you want to be able to bundle dependencies alongside your code, you're better off starting with one of the other Durable Objects templates:

- Rollup + ES Modules: https://github.com/cloudflare/durable-objects-rollup-esm
- Webpack + CommonJS Modules: https://github.com/cloudflare/durable-objects-webpack-commonjs

Worker code is in `src/`. The normal fetch handler and the Durable Object `Counter` class are in `src/index.mjs`.

Wrangler is configured to upload all files in the `src/` directory, and `index.mjs` is configured to be the main module.