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
          status: 500,
        }),
      )
    }
    event.respondWith(new Response('Internal Error', { status: 500 }))
  }
})

async function handleEvent(event) {
  const url = new URL(event.request.url)
  try {
    let options = {
      // customize how incoming requests will map to assets
      mapRequestToAsset: request => {
        // compute the key used by default (e.g. / -> index.html)
        let defaultAssetKey = mapRequestToAsset(request)
        let url = new URL(defaultAssetKey.url)
        // strip the prefix from looking up /docs for all files
        url.pathname = url.pathname.replace(/^\/docs/, '/')
        // inherit all other props from the default request
        return new Request(url.toString(), defaultAssetKey)
      },
    }
    if (DEBUG) {
      // customize caching
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
