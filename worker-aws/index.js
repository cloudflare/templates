const { DynamoDBClient, GetItemCommand, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
    await sqsExample();
    const item = await dynamoExample();
    return new Response(JSON.stringify(item), {
    headers: { 'content-type': 'application/json' },
  })
}

// replace with your region
const myRegion = "us-west-2"

async function myCredentialProvider() {
    return {
        // use wrangler secrets to provide these global variables
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY
    }
}

async function dynamoExample() {
    const client = new DynamoDBClient({
        region: myRegion,
        credentialDefaultProvider: myCredentialProvider
    });

    // replace with your table name and key as appropriate
    const put = new PutItemCommand({
        TableName: "test_table_name",
        Item: {
            "greeting": { S: "Hello!" },
            "my_primary_key": { S: "world" }
        }
    });
    await client.send(put);
    const get = new GetItemCommand({
        TableName: "test_table_name",
        Key: { "my_primary_key": { S: "world" } }
    });
    const results = await client.send(get);
    return results.Item;
}

async function sqsExample() {
    const client = new SQSClient({
        region: myRegion,
        credentialDefaultProvider: myCredentialProvider
    });

    const send = new SendMessageCommand({
        // use wrangler secrets to provide this global variable
        QueueUrl: AWS_SQS_QUEUE_URL,
        MessageBody: "Hello SQS from a Cloudflare Worker"
    });

    return client.send(send);
}
