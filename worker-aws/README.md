# Using AWS from Cloudflare Workers

This is a template for using Amazon Web Services such as DynamoDB and SQS from a Cloudflare Worker.

This project is not related to, affiliated with, sponsored or endorsed by Amazon Web Services.

#### Wrangler

To generate using [wrangler](https://github.com/cloudflare/wrangler)

```
wrangler generate projectname https://github.com/cloudflare/workers-aws-template
cd projectname
```

[`index.js`](https://github.com/cloudflare/workers-aws-template/blob/master/index.js) is the content of the Workers script. In handleRequest, uncomment the example for the service you want to try out.

You'll need to use wrangler secrets to add appropriate values for AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, plus any of the service specific secrets, e.g.

```
wrangler secret put AWS_ACCESS_KEY_ID
wrangler secret put AWS_SECRET_ACCESS_KEY
wrangler secret put AWS_AURORA_SECRET_ARN
wrangler secret put AWS_SQS_QUEUE_URL
```

Configuration of less sensitive values such as AWS_REGION can be done in wrangler.toml vars if you'd prefer.

After that you can use `wrangler publish` as normal. See the [wrangler documentation](https://developers.cloudflare.com/workers/cli-wrangler) for more information.


#### AWS SDK for JavaScript

These examples use [v3 of the AWS SDK for JavaScript](https://github.com/aws/aws-sdk-js-v3), see that repository for more information.
