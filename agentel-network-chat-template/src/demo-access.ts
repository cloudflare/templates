/** This is a single-operator starter. Authenticate before assets, RPC and WS. */
export async function checkDemoAccess(
  request: Request,
  token?: string
): Promise<Response | null> {
  if (!token || token.length < 24)
    return new Response(
      "Configure a DEMO_ACCESS_TOKEN of at least 24 characters.",
      { status: 503 }
    );
  const origin = request.headers.get("Origin");
  if (
    (origin !== null && origin !== new URL(request.url).origin) ||
    request.headers.get("Sec-Fetch-Site") === "cross-site"
  )
    return new Response("Cross-site access denied.", { status: 403 });
  const header = request.headers.get("Authorization") ?? "";
  let credentials = "";
  try {
    if (header.startsWith("Basic ")) credentials = atob(header.slice(6));
  } catch {
    /* invalid header */
  }
  const encoder = new TextEncoder();
  const [provided, expected] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(credentials)),
    crypto.subtle.digest("SHA-256", encoder.encode(`agentel:${token}`))
  ]);
  const a = new Uint8Array(provided),
    b = new Uint8Array(expected);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  if (difference === 0) return null;
  return new Response("Operator authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate":
        'Basic realm="Agentel Cloudflare starter", charset="UTF-8"',
      "Cache-Control": "no-store"
    }
  });
}
