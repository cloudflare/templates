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

  const clientIp = request.headers.get('CF-Connecting-IP');

  const res = new Response(genContent(numBytes));

  res.headers.set('access-control-allow-origin', '*');
  res.headers.set('timing-allow-origin', '*');
  res.headers.set('cache-control', 'no-store');
  res.headers.set('content-type', 'application/octet-stream');

  const exposedRequestHeaders = [
    'colo',
    'asn',
    'country',
    'city',
    'postalCode',
    'latitude',
    'longitude',
    'timezone'
  ].filter(p => (request.cf || {}).hasOwnProperty(p));

  exposedRequestHeaders.forEach(p =>
    res.headers.set(`cf-meta-${p}`, request.cf[p])
  );

  res.headers.set('cf-meta-ip', clientIp);

  res.headers.set('cf-meta-request-time', +reqTime);

  res.headers.set(
    'access-control-expose-headers',
    ['ip', 'request-time', ...exposedRequestHeaders]
      .map(p => `cf-meta-${p}`)
      .join(',')
  );

  return res;
}

module.exports = handleRequest;
