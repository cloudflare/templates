import template from './template'

let count = 0

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleSession(websocket) {
  websocket.accept()
  websocket.addEventListener("message", async ({ data }) => {
    if (data === "CLICK") {
      count += 1
      websocket.send(JSON.stringify({ count, tz: new Date() }))
    } else {
      // An unknown message came into the server. Send back an error message
      websocket.send(JSON.stringify({ error: "Unknown message received", tz: new Date() }))
    }
  })

  websocket.addEventListener("close", async evt => {
    // Handle when a client closes the WebSocket connection
    console.log(evt)
  })
}

const websocketHandler = async request => {
  const upgradeHeader = request.headers.get("Upgrade")
  if (upgradeHeader !== "websocket") {
    return new Response("Expected websocket", { status: 400 })
  }

  const [client, server] = Object.values(new WebSocketPair())
  await handleSession(server)

  return new Response(null, {
    status: 101,
    webSocket: client
  })
}

async function handleRequest(request) {
  try {
    const url = new URL(request.url)
    switch (url.pathname) {
      case '/':
        return template()
      case '/ws':
        return websocketHandler(request)
      default:
        return new Response("Not found", { status: 404 })
    }
  } catch (err) {
    return new Response(err.toString())
  }
}
