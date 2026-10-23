/**
 * x402 payment gate for the paid /batch/* routes
 *
 * Follows the same pattern as x402-proxy-template:
 * 1. If the request carries a valid `auth_token` JWT cookie, skip payment.
 * 2. Otherwise run the x402-hono payment middleware. Without an `X-PAYMENT`
 *    header it responds 402 Payment Required with payment requirements; with
 *    one, it verifies the payment through the facilitator, runs the handler,
 *    then settles the payment on-chain.
 * 3. After a new payment, issue a JWT cookie so browser clients can make
 *    follow-up calls for an hour without paying again.
 */

import type { Context, Next } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { paymentMiddleware } from "x402-hono";
import { generateJWT, verifyJWT } from "./jwt";
import type { AppContext } from "./env";

/** How long a paid session cookie stays valid, in seconds */
const SESSION_TTL_SECONDS = 3600;

export function requireBatchPayment(description: string) {
	return async (c: Context<AppContext>, next: Next) => {
		const jwtSecret = c.env.JWT_SECRET;

		// Show a clear configuration error instead of failing obscurely
		if (!jwtSecret) {
			return c.json(
				{
					error:
						"Server misconfigured: JWT_SECRET not set. See README for setup instructions.",
				},
				500
			);
		}

		// A valid session cookie from an earlier payment skips the paywall
		const token = getCookie(c, "auth_token");
		if (token) {
			const payload = await verifyJWT(token, jwtSecret);
			if (payload) {
				c.set("auth", payload);
				await next();
				return;
			}
		}

		// Build the payment middleware per request so it can read env vars.
		// x402 matches routes by path, so key the config by the current path.
		const facilitator = c.env.FACILITATOR_URL
			? { url: c.env.FACILITATOR_URL as `${string}://${string}` }
			: undefined;

		const paymentMw = paymentMiddleware(
			c.env.PAY_TO as `0x${string}`,
			{
				[c.req.path]: {
					price: c.env.BATCH_PRICE,
					network: c.env.NETWORK,
					config: { description },
				},
			},
			facilitator
		);

		return await paymentMw(c, async () => {
			// Payment verified - issue a session cookie. If settlement fails
			// afterwards, x402-hono replaces the response with a 402, which drops
			// this cookie along with the handler's response.
			const jwt = await generateJWT(jwtSecret, SESSION_TTL_SECONDS);
			setCookie(c, "auth_token", jwt, {
				httpOnly: true,
				secure: true,
				sameSite: "Strict",
				maxAge: SESSION_TTL_SECONDS,
				path: "/batch",
			});
			await next();
		});
	};
}
