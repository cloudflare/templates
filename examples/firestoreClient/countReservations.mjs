import { GCPClient } from './lib/GCPClient'

// Use the listDocuments endpoint to query all current reservations
async function getReservations(client) {
  let nextPageToken
  let count = 0
  do {
    let reservations = await client.listDocuments(RESERVATIONS, nextPageToken).then(response => response.json())
    count += reservations.length
    nextPageToken = reservations.nextPageToken
  }
  while (nextPageToken)

  return count
}

global.fetch = nodeFetch

let config = fs.readFileSync('./config/metadata.json')
let client = new GCPClient(config)

getReservations(client)
    .then(console.log)
    .catch(console.error)

