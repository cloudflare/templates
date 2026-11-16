import { defineMiddleware } from "astro:middleware";

// The admin pages read from D1 directly, so they need their own check.
// Sign in with the username "admin" and the API_TOKEN secret as the password.
export const onRequest = defineMiddleware(async (context, next) => {
  // Match on the route Astro resolved, not the raw path, so variants
  // like "//admin" can't skip the check.
  const route = context.routePattern;
  if (route !== "/admin" && !route.startsWith("/admin/")) {
    return next();
  }

  const { API_TOKEN } = context.locals.runtime.env;
  if (!API_TOKEN) {
    return new Response(
      "The admin pages are disabled. Set the API_TOKEN secret to enable them.",
      { status: 403 },
    );
  }

  const expected = `Basic ${btoa(`admin:${API_TOKEN}`)}`;
  const provided = context.request.headers.get("authorization") ?? "";
  if (!(await timingSafeEqualStrings(provided, expected))) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Admin"' },
    });
  }

  return next();
});

async function timingSafeEqualStrings(a: string, b: string) {
  const encoder = new TextEncoder();
  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(hashA, hashB);
}
