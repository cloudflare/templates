
## Router

Selects the logic based on the `request` method and URL. Use with REST APIs or apps that require basic routing logic.

[`index.js`](https://github.com/cloudflare/worker-template-router/blob/master/router.js) is the content of the Workers script.

Live Demos are hosted on `workers-tooling.cf/demo/router`:
[Demo /bar](http://workers-tooling.cf/router/bar) | [Demo /foo](http://workers-tooling.cf/router/foo)


####Wrangler
To generate using [wrangler](https://github.com/cloudflare/wrangler)

```
wrangler generate myApp https://github.com/cloudflare/worker-template-router
```

####Serverless
To deploy using serverless add a [`serverless.yml`](https://serverless.com/framework/docs/providers/cloudflare/) file.