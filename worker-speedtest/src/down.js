const DEFAULT_NUM_BYTES = 0;
const MAX_BYTES = 1e8;

const getQs = url => {
  const sp = url.split('?');
  if (sp.length < 2) {
    return {}; // no qs
  }
  const qs = sp[1];

  return Object.assign(
    {},
    ...qs.split('&').map(s => {
      const sp = s.split('=');
      if (sp.length !== 2) {
        return {};
      }

      return { [sp[0]]: sp[1] };
    })
  );
};

const genContent = (numBytes = 0) => '0'.repeat(Math.max(0, numBytes));

async function handleRequest(request) {
  const reqTime = new Date();

  const qs = getQs(request.url);

  const numBytes = qs.hasOwnProperty('bytes')
    ? Math.min(MAX_BYTES, Math.abs(+qs.bytes))
    : DEFAULT_NUM_BYTES;

  const res = new Response(genContent(numBytes));

  res.headers.set('access-control-allow-origin', '*');
  res.headers.set('timing-allow-origin', '*');
  res.headers.set('cache-control', 'no-store');
  res.headers.set('content-type', 'application/octet-stream');

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
