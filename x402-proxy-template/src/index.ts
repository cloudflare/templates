import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { createProtectedRoute, type ProtectedRouteConfig } from "./auth";
import { generateJWT } from "./jwt";
import type { AppContext, Env } from "./env";

const app = new Hono<AppContext>();

/**
 * Built-in protected paths that always require payment
 * These are used for testing and don't need to be configured
 */
const BUILTIN_PROTECTED_PATHS = ["/__x402/protected"];

/**
 * Proxy a request to the origin server.
 *
 * Two modes:
 * 1. DNS-based (ORIGIN_URL not set): Uses fetch(request) which routes to the
 *    origin server defined in your DNS records. Best for traditional backends.
 *
 * 2. External Origin (ORIGIN_URL set): Rewrites the URL to the specified origin
 *    while preserving the original Host header. This allows proxying to another
 *    Worker on a Custom Domain or any external service.
 */
async function proxyToOrigin(request: Request, env: Env): Promise<Response> {
	if (env.ORIGIN_URL) {
		// External Origin mode: rewrite URL to target origin
		const originalUrl = new URL(request.url);
		const targetUrl = new URL(env.ORIGIN_URL);

		const proxiedUrl = new URL(request.url);
		proxiedUrl.hostname = targetUrl.hostname;
		proxiedUrl.protocol = targetUrl.protocol;
		proxiedUrl.port = targetUrl.port;

		const response = await fetch(proxiedUrl, {
			method: request.method,
			headers: request.headers, // Preserves original Host header
			body: request.body,
			redirect: "manual", // Handle redirects ourselves to rewrite Location headers
		});

		// Rewrite Location header in redirects to keep user on the proxy domain
		// We rewrite ALL redirects to stay on the proxy, regardless of where the origin
		// tries to send the user (e.g., cloudflare.com -> www.cloudflare.com)
		const location = response.headers.get("Location");
		if (location) {
			try {
				const locationUrl = new URL(location, proxiedUrl);

				// Rewrite the location to point back to the proxy
				locationUrl.hostname = originalUrl.hostname;
				locationUrl.protocol = originalUrl.protocol;
				locationUrl.port = originalUrl.port;

				const newHeaders = new Headers(response.headers);
				newHeaders.set("Location", locationUrl.toString());

				return new Response(response.body, {
					status: response.status,
					statusText: response.statusText,
					headers: newHeaders,
				});
			} catch {
				// If URL parsing fails, return response as-is
			}
		}

		return response;
	}

	// DNS-based mode: forward request as-is to origin defined in DNS
	return fetch(request);
}

/**
 * Helper to check if a path matches any protected pattern
 * Includes both built-in protected paths and configured patterns
 */
function isProtectedPath(path: string, patterns: string[]): boolean {
	// Check built-in protected paths first
	if (BUILTIN_PROTECTED_PATHS.includes(path)) {
		return true;
	}

	// Then check configured patterns
	return patterns.some((pattern) => {
		// Simple pattern matching - exact match or prefix match with /*
		if (pattern.endsWith("/*")) {
			const prefix = pattern.slice(0, -2);
			return path.startsWith(prefix);
		}
		return path === pattern;
	});
}

/**
 * Main proxy handler - intercepts protected routes, proxies everything else
 * Note: This middleware runs for all routes, but route handlers below can still
 * take precedence by being registered after this middleware
 */
app.use("*", async (c, next) => {
	const path = c.req.path;
	const protectedPatterns = c.env.PROTECTED_PATTERNS || [];

	// Special handling for built-in endpoints
	// These are handled by route handlers below, not proxied
	if (path === "/__x402/health") {
		return next(); // Let the route handler below handle it
	}

	// Check if this path is protected (including /__x402/protected)
	if (isProtectedPath(path, protectedPatterns)) {
		// Ensure JWT_SECRET is configured before processing protected routes
		if (!c.env.JWT_SECRET) {
			return c.json(
				{
					error:
						"Server misconfigured: JWT_SECRET not set. See README for setup instructions.",
				},
				500
			);
		}

		// Apply authentication middleware for protected routes
		const paymentConfig = c.env.PAYMENT_CONFIG || {
			price: "$0.01",
			network: "base-sepolia",
			description: "Access to premium content for 1 hour",
		};

		// Use the protected route middleware
		const protectedMiddleware = createProtectedRoute(
			paymentConfig as ProtectedRouteConfig
		);
		let jwtToken = "";

		const result = await protectedMiddleware(c, async () => {
			// After successful auth, check if we need to issue a cookie
			const hasExistingAuth = c.get("auth");

			if (!hasExistingAuth) {
				// This is a new payment, generate JWT cookie
				jwtToken = await generateJWT(c.env.JWT_SECRET, 3600);
			}

			// Do nothing here - we'll proxy after middleware returns
		});

		// If middleware returned a response (e.g., 402), return it
		if (result) {
			return result;
		}

		// For built-in /__x402/protected endpoint, call next() to reach route handler
		if (path === "/__x402/protected") {
			await next();
			const response = c.res;

			// If we generated a JWT token, add it as a cookie to the response
			if (jwtToken) {
				setCookie(c, "auth_token", jwtToken, {
					httpOnly: true,
					secure: true,
					sameSite: "Strict",
					maxAge: 3600,
					path: "/",
				});
			}

			return response;
		}

		// Proxy the authenticated request to origin
		const originResponse = await proxyToOrigin(c.req.raw, c.env);

		// If we generated a JWT token, add it as a cookie to the response
		if (jwtToken) {
			// Clone the origin response and add our cookie header
			const newResponse = new Response(originResponse.body, {
				status: originResponse.status,
				statusText: originResponse.statusText,
				headers: new Headers(originResponse.headers),
			});

			// Add the auth cookie to the response
			newResponse.headers.append(
				"Set-Cookie",
				`auth_token=${jwtToken}; HttpOnly; Secure; SameSite=Strict; Max-Age=3600; Path=/`
			);

			return newResponse;
		}

		return originResponse;
	}

	// Proxy unprotected routes directly to origin
	return proxyToOrigin(c.req.raw, c.env);
});

/**
 * Built-in test endpoint - always public, never requires payment
 * Used for health checks and testing proxy functionality
 */
app.get("/__x402/health", (c) => {
	return c.json({
		status: "ok",
		proxy: "x402-proxy",
		message: "This endpoint is always public",
		timestamp: Date.now(),
	});
});

/**
 * Built-in test endpoint - always protected, always requires payment
 * Used for testing payment flow without needing to configure protected patterns
 * This endpoint serves content directly (not proxied to origin)
 */
app.get("/__x402/protected", (c) => {
	return c.json({
		message: "Premium content accessed!",
		timestamp: Date.now(),
		note: "This endpoint always requires payment or valid authentication cookie",
	});
});

export default app;
