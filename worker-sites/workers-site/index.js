import { getAssetFromKV, mapRequestToAsset } from '@cloudflare/kv-asset-handler'

// do not set to true in production!
const DEBUG = true

addEventListener('fetch', event => {
  try {
    event.respondWith(handleEvent(event))
  } catch (e) {
    if (DEBUG) {
      return event.respondWith(
        new Response(e.message || e.toString(), {
          status: 404,
        }),
      )
    }
    event.respondWith(new Response('Internal Error', { status: 500 }))
  }
})

const myMapRequestToAsset = request => {
  // start with the default map
  let newRequest = mapRequestToAsset(request)
  // strip the prefix from looking up all files
  return new Request(newRequest.url.replace('/docs', ''), newRequest)
}
async function handleEvent(event) {
  const url = new URL(event.request.url)
  try {
    let options = {
      mapRequestToAsset: myMapRequestToAsset,
    }
    if (DEBUG) {
      options.cacheControl = {
        bypassCache: true,
      }
    }
    return await getAssetFromKV(event, options)
  } catch (e) {
    if (DEBUG) {
      return new Response(e.message || e.toString(), {
        status: 404,
      })
    } else {
      return new Response(`"${mapRequestToAsset(url.pathname)}" not found`, {
        status: 404,
      })
    }
  }
}
