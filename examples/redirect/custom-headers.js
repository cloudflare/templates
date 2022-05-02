// Redirect based on custom request headers

addEventListener('fetch', event => {
  event.respondWith(fetchAndApply(event.request));
});

async function fetchAndApply(request) {
  let suffix = '';

  // Check for a custom header sent by the client
  if (request.headers.get('X-Dev-Mode')) {
    suffix = '/dev';
  }

  const init = {
    method: request.method,
    headers: request.headers,
  };
  const modifiedRequest = new Request(request.url + suffix, init);
  return fetch(modifiedRequest);
}
