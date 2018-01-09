// Blacklist IP addresses. 
// This snippet of code prevents a specific IP, 
// in this case '225.0.0.1' from connecting to the origin.

addEventListener('fetch', event => {
  event.respondWith(fetchAndApply(event.request))
})

async function fetchAndApply(request) {  
  if (request.headers.get('x-real-ip') === '225.0.0.1') {
    return new Response('Sorry, this page is not available.',
        { status: 403, statusText: 'Forbidden' })
  }

  return fetch(request)
}
