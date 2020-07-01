# `cobol-worker`

A Cloudflare worker that runs COBOL.

`src/index.js` is the content of the Workers script.

## Wrangler

To generate using [wrangler](https://github.com/cloudflare/wrangler)

```console
wrangler generate myapp https://github.com/xtuc/cobol-worker-template
```

To develop your Worker on your local network

```console
npm run dev
```

To preview your Worker in the browser

```console
npm run preview
```

To deploy the worker:

```console
npm run deploy
```
