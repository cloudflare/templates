# 👷 `cf-worker-typescript-template` Hello World

A template for kick starting a Typescript Cloudflare worker project.

## Getting Started

This template is meant to be used with [`wrangler`](https://github.com/cloudflare/wrangler). If you are not already familiar with the tool, we recommend that you install the tool and configure it to work with your [Cloudflare account](https://dash.cloudflare.com).

To generate using `wrangler`, run this command:

```bash
wrangler generate my-ts-project https://github.com/EverlastingBugstopper/cf-worker-typescript-template
```

### Developing

[`src/index.js`](https://github.com/EverlastingBugstopper/cf-worker-typescript-template/blob/master/src/index.ts) calls the request handler in [`src/handler.ts`](https://github.com/EverlastingBugstopper/cf-worker-typescript-template/blob/master/src/handler.ts), and will return the [request method](https://developer.mozilla.org/en-US/docs/Web/API/Request/method) for the given request.

### Testing

This template comes with mocha tests which simply test that the request handler can handle each request method. `npm test` will run your tests.

### Formatting

This template uses [`tslint`](https://github.com/palantir/tslint) to format the project. To invoke, run `npm run fmt`.

### Previewing and Publishing

For information on how to preview and publish your worker, please see the `wrangler` [README](https://github.com/cloudflare/wrangler#%EF%B8%8F--publish).

## Issues

If you run into issues with this specific project, please feel free to file an issue!
