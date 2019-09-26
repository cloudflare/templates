import {
  getAssetFromKV,
  defaultRequestKeyModifier,
} from '@cloudflare/kv-asset-handler'

// do not set to true in production!
const DEBUG = true

addEventListener('fetch', event => {
  try {
    event.respondWith(handleEvent(event))
  } catch (e) {
    if (DEBUG) {
    return event.respondWith(new Response(e.message || e.toString(), {
      status: 404,
    }))
  }
    event.respondWith(new Response('Internal Error', { status: 500 }))
  }
})

async function handleEvent(event) {
  const url = new URL(event.request.url)
  try {
    let options = {}
    if (DEBUG) {
      options = {
        cacheControl: {
          bypassCache: true,
        },
      }
    }
    return await getAssetFromKV(event, options)
  } catch (e) {
    if (DEBUG) {
      return new Response(e.message || e.toString(), {
        status: 404,
      })
    } else {
      return new Response(
        `"${defaultRequestKeyModifier(event.request).url}" not found`,
        { status: 404 },
      )
    }
  }
}