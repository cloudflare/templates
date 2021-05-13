## Router

This template demonstrates using the [`itty-router`](https://github.com/kwhitley/itty-router) package to add routing to your Cloudflare Workers.

[`index.js`](https://github.com/cloudflare/worker-template-router/blob/master/index.js) is the content of the Workers script.

#### Wrangler

You can use [wrangler](https://github.com/cloudflare/wrangler) to generate a new Cloudflare Workers project based on this template by running the following command from your terminal:

```
wrangler generate myapp https://github.com/cloudflare/worker-template-router
```

Before publishing your code you need to edit `wrangler.toml` file and add your Cloudflare `account_id` - more information about configuring and publishing your code can be found [in the documentation](https://developers.cloudflare.com/workers/learning/getting-started#7-configure-your-project-for-deployment).

Once you are ready, you can publish your code by running the following command:

```
wrangler publish
```
