const { DynamoDBClient, GetItemCommand, PutItemCommand } = require("@aws-sdk/client-dynamodb");

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
    const item = await dynamoExample();
    return new Response(JSON.stringify(item), {
    headers: { 'content-type': 'application/json' },
  })
}

async function myCredentialProvider() {
    return {
        // use wrangler secrets to provide these global variables
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY
    }
}

async function dynamoExample() {
    const client = new DynamoDBClient({
        region: "us-west-2",
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
