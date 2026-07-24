/**
 * Authentication middleware for cookie-based JWT verification
 */

import { HTTPFacilitatorClient } from "@x402/core/server";
import type { Network } from "@x402/core/types";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { Context, Next, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { verifyJWT } from "./jwt";
import type { AppContext, Env } from "./env";

export const DEFAULT_FACILITATOR_URL = "https://x402.org/facilitator";

const NETWORK_ALIASES: Record<string, Network> = {
	"base-sepolia": "eip155:84532",
	base: "eip155:8453",
	solana: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
	"solana-devnet": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
};

type NetworkResolution =
	| { ok: true; networks: Network[] }
	| { ok: false; error: string };

type PaymentConfigResolution =
	| {
			ok: true;
			config: {
				facilitatorUrl: string;
				networks: Network[];
				payToEvm?: string;
				payToSolana?: string;
			};
	  }
	| { ok: false; error: string };

const middlewareCache = new Map<string, MiddlewareHandler>();

function configError(message: string): string {
	return `Server misconfigured: ${message}. See README for setup instructions.`;
}

/**
 * Resolve a comma-separated NETWORK value to v2 CAIP-2 network identifiers.
 */
export function resolveNetworks(value: string | undefined): NetworkResolution {
	const entries = (value || "")
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean);

	if (entries.length === 0) {
		return { ok: false, error: configError("NETWORK not set") };
	}

	const networks: Network[] = [];
	for (const entry of entries) {
		const network = NETWORK_ALIASES[entry] || entry;
		if (!/^(eip155|solana):[^:]+$/.test(network)) {
			return {
				ok: false,
				error: configError(`unknown NETWORK entry "${entry}"`),
			};
		}
		if (!networks.includes(network as Network)) {
			networks.push(network as Network);
		}
	}

	return { ok: true, networks };
}

/**
 * Resolve and validate all payment-related Worker configuration.
 */
export function resolvePaymentConfig(env: Env): PaymentConfigResolution {
	const networkResolution = resolveNetworks(env.NETWORK);
	if (!networkResolution.ok) {
		return { ok: false, error: networkResolution.error };
	}

	const needsEvm = networkResolution.networks.some((network) =>
		network.startsWith("eip155:")
	);
	const needsSolana = networkResolution.networks.some((network) =>
		network.startsWith("solana:")
	);

	if (needsEvm && !env.PAY_TO) {
		return {
			ok: false,
			error: configError("PAY_TO not set for an eip155 network"),
		};
	}
	if (needsSolana && !env.PAY_TO_SOLANA) {
		return {
			ok: false,
			error: configError("PAY_TO_SOLANA not set for a solana network"),
		};
	}

	return {
		ok: true,
		config: {
			facilitatorUrl: env.FACILITATOR_URL || DEFAULT_FACILITATOR_URL,
			networks: networkResolution.networks,
			payToEvm: env.PAY_TO,
			payToSolana: env.PAY_TO_SOLANA,
		},
	};
}

/**
 * Creates a combined middleware that checks for valid cookie authentication
 * and conditionally applies payment middleware only if cookie auth fails
 *
 * @param paymentMiddleware - The payment middleware to apply when no valid cookie exists
 * @returns Combined authentication and payment middleware
 */
export function requirePaymentOrCookie(paymentMw: MiddlewareHandler) {
	return async (c: Context<AppContext>, next: Next) => {
		// Check for valid cookie
		const token = getCookie(c, "auth_token");

		if (token) {
			const jwtSecret = c.env.JWT_SECRET;

			// Ensure JWT_SECRET is configured
			if (!jwtSecret) {
				return c.json(
					{
						error:
							"Server misconfigured: JWT_SECRET not set. See README for setup instructions.",
					},
					500
				);
			}

			const payload = await verifyJWT(token, jwtSecret);

			// If token is valid, skip payment and go directly to handler
			if (payload) {
				c.set("auth", payload);
				await next(); // Call the handler
				return;
			}
		}

		// No valid cookie - apply payment middleware
		return await paymentMw(c, next);
	};
}

/**
 * Configuration for a protected route that requires payment
 */
export interface ProtectedRouteConfig {
	/** Route pattern to protect (e.g., "/premium", "/api/paid/*") */
	pattern: string;
	/** Price in USD (e.g. "$0.01") */
	price: string;
	/** Human-readable description of what the payment is for */
	description: string;
	/**
	 * Bot Management Filtering (optional)
	 * Requires Bot Management for Enterprise. See src/bot-management/ for details.
	 */
	bot_score_threshold?: number;
	except_detection_ids?: number[];
}

/**
 * Convert the template's trailing `/*` prefix convention to the x402 v2
 * wildcard that preserves the same matching behavior.
 */
function toX402RoutePattern(pattern: string): string {
	return pattern.endsWith("/*") ? `${pattern.slice(0, -2)}*` : pattern;
}

/**
 * Get or create one payment middleware covering all configured protected routes.
 * The deterministic cache key prevents facilitator synchronization per request.
 *
 * @param configs - All built-in and user-configured protected routes
 * @returns Middleware that enforces payment or cookie authentication
 */
export function createProtectedRoute(configs: ProtectedRouteConfig[]) {
	return async (c: Context<AppContext>, next: Next) => {
		const resolution = resolvePaymentConfig(c.env);
		if (!resolution.ok) {
			return c.json({ error: resolution.error }, 500);
		}

		const { facilitatorUrl, networks, payToEvm, payToSolana } =
			resolution.config;
		const fingerprint = JSON.stringify({
			facilitatorUrl,
			networks,
			payToEvm,
			payToSolana,
			routes: configs.map(({ pattern, price, description }) => ({
				pattern,
				price,
				description,
			})),
		});

		let paymentMw = middlewareCache.get(fingerprint);
		if (!paymentMw) {
			const routes: Parameters<typeof paymentMiddleware>[0] = {};
			for (const config of configs) {
				const routePattern = toX402RoutePattern(config.pattern);
				if (routePattern in routes) {
					continue;
				}
				routes[routePattern] = {
					accepts: networks.map((network) => ({
						scheme: "exact",
						price: config.price,
						network,
						payTo: network.startsWith("eip155:")
							? (payToEvm as string)
							: (payToSolana as string),
					})),
					description: config.description,
				};
			}

			const facilitator = new HTTPFacilitatorClient({ url: facilitatorUrl });
			const server = new x402ResourceServer(facilitator);
			for (const network of networks) {
				server.register(
					network,
					network.startsWith("eip155:")
						? new ExactEvmScheme()
						: new ExactSvmScheme()
				);
			}

			paymentMw = paymentMiddleware(routes, server);
			middlewareCache.set(fingerprint, paymentMw);
		}

		// Apply the combined auth/payment middleware
		return await requirePaymentOrCookie(paymentMw)(c, next);
	};
}
