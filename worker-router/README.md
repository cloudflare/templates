## Router

Selects the logic to respond to requests based on the `request` method and URL. Can be used with REST APIs or apps that require basic routing logic.

[`index.js`](https://github.com/cloudflare/worker-template-router/blob/master/router.js) is the content of the Workers script.

Live Demos are hosted on `workers-tooling.cf/demos/router`:
[Demo /bar](http://workers-tooling.cf/demos/router/bar) | [Demo /foo](http://workers-tooling.cf/demos/router/foo)

#### Wrangler

You can use [wrangler](https://github.com/cloudflare/wrangler) to generate a new Cloudflare Workers project based on this template by running the following command from your terminal:

```
wrangler generate myApp https://github.com/cloudflare/worker-template-router
```

Before publishing your code you need to edit `wrangler.toml` file and add your `account_id` (Your Cloudflare account ID) number, for more information about publishing your code [check](https://workers.cloudflare.com/docs/quickstart/configuring-and-publishing/) documentaion.

Once you are ready, you can publish your code by running the following command:

```
wrangler publish
```

#### Serverless
To deploy using serverless add a [`serverless.yml`](https://serverless.com/framework/docs/providers/cloudflare/) file.
