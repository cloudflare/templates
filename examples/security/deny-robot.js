// Protect your origin from unwanted spiders or crawlers. 
// In this case, if the user-agent is "annoying-robot", 
// the worker returns the response instead of sending the request to the origin.

addEventListener('fetch', event => {
  event.respondWith(fetchAndApply(event.request))
})

async function fetchAndApply(request) {  
  if (request.headers.get('user-agent').includes('annoying_robot')) {
    return new Response('Forbidden')
  }

  const response = await fetch(request)
  return response
}