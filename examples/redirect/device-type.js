// Redirect based on the device type

addEventListener('fetch', event => {
  event.respondWith(fetchAndApply(event.request));
});

async function fetchAndApply(request) {
  const init = {
    method: request.method,
    headers: request.headers,
  };

  let uaSuffix = '';

  const ua = request.headers.get('user-agent');
  if (ua.match('/iphone/i') || ua.match('/ipod/i')) {
    uaSuffix = '/mobile';
  } else if (ua.match('/ipad/i')) {
    uaSuffix = '/tablet';
  }

  const modifiedRequest = new Request(request.url + uaSuffix, init);
  return fetch(modifiedRequest);
}
