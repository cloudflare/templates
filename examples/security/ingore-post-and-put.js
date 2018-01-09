// Ignore POST and PUT HTTP requests. 
// This snippet allows all other requests to pass through to the origin.

addEventListener('fetch', event => {
  event.respondWith(fetchAndApply(event.request))
})

async function fetchAndApply(request) {  
  if (request.method === 'POST' || request.method === 'PUT') {
    return new Response('Sorry, this page is not available.',
        { status: 403, statusText: 'Forbidden' })
  }

  const response = await fetch(request)
  return response
}
