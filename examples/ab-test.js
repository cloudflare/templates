//Create a Cloudflare Worker to perform A/B Testing on your site.

addEventListener('fetch', event => {
  event.respondWith(fetchAndApply(event.request))
})

async function fetchAndApply(request) {
  const control = 'experiment-0=control'
  const test = 'experiment-0=test'
  const controlUriSuffix = '/control'
  const testUriSuffix = '/test'
  let suffix = ''

  const cookie = request.headers.get('Cookie')
  if (cookie === undefined || (!cookie.includes(control) && !cookie.includes(test))) {
    // 50/50 Split
    if (Math.floor(Math.random() * 2)) {
      suffix = controlUriSuffix
    } else {
      suffix = testUriSuffix
    }
  }

  if (cookie.includes(control)) {
    suffix = controlUriSuffix
  } else if (cookie.includes(test)) {
    suffix = testUriSuffix
  }

  const init = {
    method: request.method,
    headers: request.headers
  }

  const modifiedRequest = new Request(request.url+suffix, init)
  // We are assuming that the server is adding the Set-Cookie header with the correct slice
  const response = await fetch(modifiedRequest)
  return response
}
