export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const policyPath = '/.well-known/mta-sts.txt';

    const defaultHeaders = {
      'Content-Type': 'text/plain; charset=utf-8',
      // Optional
      'Strict-Transport-Security': 'max-age=31536000',
    };

    // 1) Redirect everything that's not the canonical path to the policy URL
    //    Dedicated hostname => cache redirect aggressively
    if (url.pathname !== policyPath) {
      const target = new URL(policyPath, url.origin).toString();
      const redirectHeaders = new Headers({
        ...defaultHeaders,
        'Location': target,
        'Cache-Control': 'public, max-age=604800, immutable',
      });
      return new Response(null, { status: 308, headers: redirectHeaders });
    }

    // 2) Only GET/HEAD are allowed
    const method = request.method.toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      const h = new Headers({ ...defaultHeaders, 'Allow': 'GET, HEAD' });
      return new Response('Method Not Allowed', { status: 405, headers: h });
    }

    // --- Read & validate environment variables ---

    // mode: enforce | testing | none
    const allowedModes = new Set(['enforce', 'testing', 'none']);
    const modeRaw = (env.MODE || 'none').toLowerCase();
    const mode = allowedModes.has(modeRaw) ? modeRaw : 'none';

    // max_age: non-negative integer, max 31,557,600 (RFC 8461 §3.2)
    const MAX_AGE_DEFAULT = 60;
    const MAX_AGE_MAX = 31_557_600;

    const rawMaxAge = (env.MAX_AGE ?? '').trim();
    const parsedMaxAge = rawMaxAge === '' ? MAX_AGE_DEFAULT : Number(rawMaxAge);

    const maxAge =
      Number.isInteger(parsedMaxAge) &&
      parsedMaxAge >= 0 &&
      parsedMaxAge <= MAX_AGE_MAX
        ? parsedMaxAge
        : MAX_AGE_DEFAULT;

    // mx: only applicable for enforce/testing
    const mxLines =
      mode !== 'none'
        ? String(env.MX_HOSTS || '')
            .split(/[, \s]+/)
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
