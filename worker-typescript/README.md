# 👷 `cf-worker-typescript-template` Hello World

A template for kick starting a Typescript Cloudflare worker project.

## Getting Started

To generate using [wrangler](https://github.com/cloudflare/wrangler)

```bash
wrangler generate my-ts-project https://github.com/EverlastingBugstopper/cf-worker-typescript-template
```

### Developing

[`src/index.js`](https://github.com/EverlastingBugstopper/cf-worker-typescript-template/blob/master/src/index.ts) calls the request handler in [`src/handler.ts`](https://github.com/EverlastingBugstopper/cf-worker-typescript-template/blob/master/src/handler.ts), and will return the [request method](https://developer.mozilla.org/en-US/docs/Web/API/Request/method) for the given request.

### Preview

To see the worker in action, you can run `wrangler preview`, `wrangler` should build the project and open a new tab showing a successful `GET` request.

### Publishing

To publish your worker, see documentation for [`wrangler`](https://github.com/cloudflare/wrangler)

### Testing

This template comes with mocha tests which simply test that the request handler can handle each request method. `npm test` will run your tests.

### Formatting

This template uses [`tslint`](https://github.com/palantir/tslint) to format the project. To invoke, run `npm run fmt`.

