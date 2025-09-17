export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const policyPath = '/.well-known/mta-sts.txt';

    // recommended MAX_AGEs:
    // 1 week: 604800   (good for testing)
    // 1 month: 2628000 (good for prod?)
    // 1 year: 31557600 (you cannot go higher as defined in RFC 8461)

    // max_age: non-negative integer, max 31,557,600 (RFC 8461 §3.2)
    const MAX_AGE_MIN = 0;           // if MAX_AGE < MAX_AGE_MIN then we use MAX_AGE_DEFAULT
    const MAX_AGE_DEFAULT = 60;      // only used until you set environment variable MAX_AGE
    const MAX_AGE_MAX = 31_557_600;  // if MAX_AGE > MAX_AGE_MAX then we use MAX_AGE_MAX

    const rawMaxAge = String(env.MAX_AGE ?? '').trim();
    const parsedMaxAge = rawMaxAge === '' ? NaN : parseInt(rawMaxAge, 10);
    const maxAge = !Number.isInteger(parsedMaxAge) || parsedMaxAge < 0
      ? MAX_AGE_DEFAULT // RFC: Non-negative integer required
      : parsedMaxAge < MAX_AGE_MIN
        ? MAX_AGE_DEFAULT // Your choice: reset to default if too low
        : parsedMaxAge > MAX_AGE_MAX
          ? MAX_AGE_MAX // RFC: Usually 1 year (31557600)
          : parsedMaxAge;

    const defaultHeaders = {
      'Allow': 'GET, HEAD',
      'Content-Type': 'text/plain; charset=utf-8',
      // Optional
      'Strict-Transport-Security': `max-age=${maxAge}`,
    };

    // Only GET/HEAD are allowed
    const method = request.method.toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      const h = new Headers({ ...defaultHeaders, 'Allow': 'GET, HEAD' });
      return new Response('Method Not Allowed', { status: 405, headers: h });
    }

    // Redirect everything that's not the canonical path to the policy URL
    // Dedicated hostname => cache redirect aggressively
    if (url.pathname !== policyPath) {
      const target = new URL(policyPath, url.origin).toString();
      const redirectHeaders = new Headers({
        ...defaultHeaders,
        'Location': target,
        'Cache-Control': `public, max-age=${maxAge}, immutable`,
      });
      return new Response(null, { status: 308, headers: redirectHeaders });
    }

    // mode: enforce | testing | none
    const allowedModes = new Set(['enforce', 'testing', 'none']);
    const modeRaw = (env.MODE || 'none').toLowerCase();
    const mode = allowedModes.has(modeRaw) ? modeRaw : 'none';

    // mx: only applicable for enforce/testing
    const mxLines =
      mode !== 'none'
        ? String(env.MX_HOSTS || '')
            .split(/[,\s]+/)
            .map((s) => s.trim())
            .filter(Boolean)
            .map((mx) => `mx: ${mx}`)
        : [];

    // Enforce RFC rule: mx required when mode is enforce/testing
    if ((mode === 'enforce' || mode === 'testing') && mxLines.length === 0) {
      const h = new Headers({ ...defaultHeaders });
      return new Response(
        'Misconfigured Worker: MX_HOSTS required when MODE is "enforce" or "testing".',
        { status: 500, headers: h }
      );
    }

    // For mode "none", omit mx lines in the policy output
    const lines = [
      'version: STSv1',
      `mode: ${mode}`,
      ...mxLines,
      `max_age: ${maxAge}`,
    ];
    const body = lines.join('\n') + '\n'; // add newline at end of file
    const headers = new Headers(defaultHeaders);

    if (method == 'HEAD') {
        return new Response(null, { status: 200, headers });
    }

    return new Response(body, { status: 200, headers });
  },
};
