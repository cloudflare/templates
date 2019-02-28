const fetch = require('node-fetch')

const {
  CLOUDFLARE_AUTH_KEY,
  CLOUDFLARE_AUTH_EMAIL,
  CLOUDFLARE_ACCOUNT_ID,
} = process.env

const JWT_CONFIG_NAMESPACE = 'gcpAuth'

// URL and headers for KV API calls https://api.cloudflare.com/#workers-kv-namespace-properties
const kvURI = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces`
const headers = {
  'X-Auth-Email': CLOUDFLARE_AUTH_EMAIL,
  'X-Auth-Key': CLOUDFLARE_AUTH_KEY,
  'Content-Type': 'application/json',
}

async function setUpKV() {
  // Add a KV namespace
  // note: if you are using serverless framework, you can skip this set
  // kv namespace bindings in serverless.yaml
  // if not, you'll want to add logic here to get the list of namespaces
  // and update only if the namespace you want is not already set.
  let namespaceId = await fetch(kvURI, {
    method: 'POST',
    headers,
    body: JSON.stringify({ title: JWT_CONFIG_NAMESPACE })
  }).then(response => response.json()).then(data => {
    if (!data.success) throw new Error(JSON.stringify(data.errors))

    return data.result.id
  })

  // set the config variable to the json blob with our jwt settings
  await fetch(`${kvURI}/${namespaceId}/values/config`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(require('../config/metadata.json'))
  }).then(response => response.json()).then(data => {
    if (!data.success) {
      throw new Error(JSON.stringify(data.errors))
    }
  })
}

setUpKV()
  .catch(console.error)

