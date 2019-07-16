async function handleRequest(request) {
  const reqTime = new Date();

  const res = new Response('ok');

  res.headers.set('access-control-allow-origin', '*');
  res.headers.set('timing-allow-origin', '*');

  request.cf &&
    request.cf.colo &&
    res.headers.set('cf-meta-colo', request.cf.colo);

  res.headers.set('cf-meta-request-time', +reqTime);

  res.headers.set(
    'access-control-expose-headers',
    'cf-meta-colo, cf-meta-request-time'
  );

  return res;
}

module.exports = handleRequest;
