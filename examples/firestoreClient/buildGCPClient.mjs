import { generateJWT } from './generateJWT'

async function buildGCPClient() {
  let config = await firebaseConfig.get('config', 'json')
  let url = FIREBASE_API_URL
  return new GCPClient(config)
}

export class GCPClient {
  constructor(config) {
    this.url = config.url
    this.config = config
  }

  async authHeaders() {
    let token = await generateJWT(this.config)
    return { Authorization: `Bearer ${token}` }
  }

  async getDocument(collection, documentId) {
    let headers = await this.authHeaders()
    return fetch(`${this.url}/${collection}/${documentId}`, {
      headers,
    })
  }

  async postDocument(collection, doc, documentId = null) {
    let headers = await this.authHeaders()
    let fields = Object.entries(doc).reduce((acc, [k, v]) => ({ ...acc, [k]: { stringValue: v } }), {})
    let qs = ''
    if (documentId) {
      qs = `?documentId=${encodeURIComponent(documentId)}`
    }
    return fetch(`${this.url}/${collection}${qs}`, {
      headers,
      method: 'POST',
      body: JSON.stringify({
        fields,
      })
    })
  }

  async listDocuments(collection, nextPageToken) {
    let headers = await this.authHeaders()
    let qs = new URLSearchParams({
      fields: 'documents(fields,name),nextPageToken',
    })
    if (nextPageToken) qs.append('pageToken', nextPageToken)
    return fetch(`${this.url}/${collection}?${qs.toString()}`, {
      method: 'GET',
      headers,
    })
  }
}

export async function buildGCPClient() {
  let config = await firebaseConfig.get('config', 'json')
  let url = FIREBASE_API_URL
  return new GCPClient(url, config)
}
