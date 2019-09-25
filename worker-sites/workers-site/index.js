import { getAssetFromKV, defaultKeyModifier} from '@cloudflare/kv-asset-handler'

// do not set to true in production!
const DEBUG = false

addEventListener('fetch', event => {
  event.respondWith(handleEvent(event))
})

async function handleEvent(event) {
  const url = new URL(event.request.url)
  try {
    let options = {}
    if (DEBUG) {
      options = {
        cacheControl: {
          bypassCache: true
        }
      }
    }
    return await getAssetFromKV(event, options)
  } catch (e) {
    if (DEBUG) {
      return new Response(e.message || e.toString(), {
        status: 404,
      })
    } else {
      return new Response(`"${defaultKeyModifier(url.pathname)}" not found`, { status: 404 })
    }
  }
}
