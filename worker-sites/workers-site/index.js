import {
  getAssetFromKV,
  defaultRequestKeyModifier,
} from '@cloudflare/kv-asset-handler'

// do not set to true in production!
const DEBUG = false

addEventListener('fetch', event => {
  try {
    event.respondWith(handleEvent(event))
  } catch (e) {
    event.respondWith(new Response('Internal Error', { status: 500 }))
  }
})

async function handleEvent(event) {
  const url = new URL(event.request.url)
  // Set up a canonical redirect so every directory has one path
  // that ends in a slash. Helps with SEO
  if (!url.pathname.endsWith('/') && is_directory(url)) {
    return Response.redirect(url.toString().concat('/'), 301)
  }
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
const is_directory = url => {
  const path = url.pathname
  const bits = path.split('/')
  const last = bits[bits.length - 1]

  // does the final component contain a dot? technically there may be edge cases 
  // but for our site there is not
  return !last.includes('.')
}
