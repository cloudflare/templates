const fs = require('fs')
const path = require('path')
const YAML = require('yaml-js')

// Service Definition for Firestore can be found here:
// https://github.com/googleapis/googleapis/blob/master/google/firestore/firestore_v1.yaml
// Service Account Config should be the JSON file you saved when you created the API key
let [serviceDefinitionPath, serviceAccountConfigPath] = process.argv.slice(2)

let serviceDefinition = YAML.load(fs.readFileSync(serviceDefinitionPath))
let serviceAccountConfig = require(path.resolve(serviceAccountConfigPath))

// JWT spec at https://developers.google.com/identity/protocols/OAuth2ServiceAccount#jwt-auth
let payload = {
  aud: `https://${serviceDefinition.name}/${serviceDefinition.apis[0].name}`,
  iss: serviceAccountConfig.client_email,
  sub: serviceAccountConfig.client_email,
  // time-based fields to be added when the key is generated per request (in generateJWT.js)
}

let privateKey = serviceAccountConfig.private_key
let privateKeyID = serviceAccountConfig.private_key_id
let algorithm = 'RS256'
let url = `https://firestore.googleapis.com/v1beta1/projects/${serviceAccountConfig.project_id}/databases/(default)/documents`

// The object we want to send to KV
let FIREBASE_JWT_CONFIG = {
  payload,
  privateKey,
  privateKeyID,
  algorithm,
  url,
}

// Write out to JSON file to send to KV
fs.writeFileSync('./config/metadata.json', JSON.stringify(FIREBASE_JWT_CONFIG))

console.log('Worker metadata file created at', metadataFilename)

