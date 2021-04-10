const { DynamoDBClient, GetItemCommand, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
const { RDSDataClient, ExecuteStatementCommand } = require("@aws-sdk/client-rds-data");


addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function myCredentialProvider() {
    return {
        // use wrangler secrets to provide these global variables
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY
    }
}

async function handleRequest(request) {
    // The AWS SDK tries to use crypto from off of the window,
    // so we need to trick it into finding it where it expects it
    global.window = {}
    window.crypto = crypto

    // uncomment the example you want to try out, comment the rest
    const result = await sqsExample();
    // const result = await dynamoExample();
    // const result = await auroraExample(request);

    return new Response(JSON.stringify(result), {
    headers: { 'content-type': 'text/plain' },
  })
}

async function sqsExample() {
    const client = new SQSClient({
        region: AWS_REGION,
        credentialDefaultProvider: myCredentialProvider
    });

    const send = new SendMessageCommand({
        // use wrangler secrets to provide this global variable
        QueueUrl: AWS_SQS_QUEUE_URL,
        MessageBody: "Hello SQS from a Cloudflare Worker"
    });

    return client.send(send);
}

async function dynamoExample() {
    const client = new DynamoDBClient({
        region: AWS_REGION,
        credentialDefaultProvider: myCredentialProvider
    });

    // replace with your table name and key as appropriate
    const put = new PutItemCommand({
        TableName: AWS_DYNAMO_TABLE,
        Item: {
            "greeting": { S: "Hello!" },
            [AWS_DYNAMO_PRIMARYKEY]: { S: "world" }
        }
    });
    await client.send(put);
    const get = new GetItemCommand({
        TableName: AWS_DYNAMO_TABLE,
        Key: {
            [AWS_DYNAMO_PRIMARYKEY]: { S: "world" }
        }
    });
    const results = await client.send(get);
    return results.Item;
}

async function auroraExample(request) {
  if (request.method === "POST") {
    const jsonData = await request.json()
    return await auroraPostData(jsonData)
  } else {
    // We need to create a URL object so we can read the query parameters from the request
    const url = new URL(request.url)
    const ID = url.searchParams.get("ID")
    return await auroraGetData(ID)
  }
}

async function auroraGetData(ID) {
  const client = new RDSDataClient({
    region: AWS_REGION,
    credentialDefaultProvider: myCredentialProvider
  });

  const call = new ExecuteStatementCommand({
    // This SQL command is susceptible to SQL Injections and
    // is not production ready
    sql: `SELECT * FROM ${AWS_AURORA_TABLE_NAME} WHERE id = ${ID};`,
    resourceArn: AWS_AURORA_RESOURCE_ARN,
    secretArn: AWS_AURORA_SECRET_ARN
  })

  const results = await client.send(call)

  return results.records
}

async function auroraPostData(jsonData) {
  const client = new RDSDataClient({
    region: AWS_REGION,
    credentialDefaultProvider: myCredentialProvider
  });

  const keysArray = Object.keys(jsonData)
  let keys  = ""
  let values = ""

  keysArray.forEach((key, index) => {
    keys += `${key}`
    values += `'${jsonData[key]}'`

    if (index !== keysArray.length - 1) {
      keys += ", "
      values += ", "
    }
  })

  const call = new ExecuteStatementCommand({

    // This SQL command is susceptible to SQL Injections and
    // is not production ready
    sql: `INSERT INTO ${AWS_AURORA_TABLE_NAME}(${keys}) VALUES (${values});`,
    resourceArn: AWS_AURORA_RESOURCE_ARN,
    secretArn: AWS_AURORA_SECRET_ARN
  })

  const results = await client.send(call)

  return results
}
