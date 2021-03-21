# 👷 Durable Objects Counter template

A template for kick-starting a Cloudflare Workers project using:

- Durable Objects
- Modules (ES Modules to be specific)
- Wrangler

Worker code is in `src/`. The normal fetch handler and the Durable Object `Counter` class are in `src/index.mjs`.

Wrangler is configured to upload all files in the `src/` directory, and `index.mjs` is configured to be the main module.

On your first publish, you must use `wrangler publish --new-class` to allow the Counter class to implement Durable Objects.
