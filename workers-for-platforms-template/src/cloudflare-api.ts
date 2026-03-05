// Cloudflare API integration for custom hostnames
import type { Env } from "./env";

function getAuthHeaders(env: Env): Record<string, string> {
	// Prefer user-provided API token with SSL permissions
	// Fall back to dispatch namespace token (may not have SSL permissions)
	const token = env.CLOUDFLARE_API_TOKEN || env.DISPATCH_NAMESPACE_API_TOKEN;

	if (token) {
		return {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		};
	}
	return {};
}

function isApiConfigured(env: Env): boolean {
	const hasAuth =
		!!env.CLOUDFLARE_API_TOKEN || !!env.DISPATCH_NAMESPACE_API_TOKEN;
	const configured = !!(env.CLOUDFLARE_ZONE_ID && hasAuth);
	if (!configured) {
		console.error("Custom hostname API not configured:", {
			hasZoneId: !!env.CLOUDFLARE_ZONE_ID,
			hasApiToken: !!env.CLOUDFLARE_API_TOKEN,
			hasDispatchToken: !!env.DISPATCH_NAMESPACE_API_TOKEN,
		});
	}
	return configured;
}

export async function createCustomHostname(
	env: Env,
	hostname: string,
): Promise<boolean> {
	if (!isApiConfigured(env)) {
		return false;
	}

	try {
		const response = await fetch(
			`https://api.cloudflare.com/client/v4/zones/${env.CLOUDFLARE_ZONE_ID}/custom_hostnames`,
			{
				method: "POST",
				headers: getAuthHeaders(env),
				body: JSON.stringify({
					hostname: hostname,
					ssl: {
						method: "http",
						type: "dv",
						settings: {
							http2: "on",
							min_tls_version: "1.2",
							tls_1_3: "on",
						},
					},
				}),
			},
		);

		return response.ok;
	} catch (error) {
		return false;
	}
}

export interface CustomHostnameStatus {
	status: "active" | "pending" | "error" | "not_found";
	ssl?: {
		status: string;
		validation_method?: string;
		validation_errors?: string[];
		validation_records?: Array<{
			txt_name?: string;
			txt_value?: string;
			http_url?: string;
			http_body?: string;
		}>;
	};
	verification_errors?: string[];
}

export async function getCustomHostnameStatus(
	env: Env,
	hostname: string,
): Promise<CustomHostnameStatus> {
	if (!isApiConfigured(env)) {
		return { status: "error", verification_errors: ["API not configured"] };
	}

	try {
		const response = await fetch(
			`https://api.cloudflare.com/client/v4/zones/${env.CLOUDFLARE_ZONE_ID}/custom_hostnames?hostname=${hostname}`,
			{
				headers: getAuthHeaders(env),
			},
		);

		const result = (await response.json()) as {
			success: boolean;
			result?: any[];
			errors?: Array<{ message: string }>;
		};

		if (!response.ok || !result.success) {
			const errorMsg = result.errors?.[0]?.message || "API request failed";
			console.error("Custom hostname API error:", errorMsg, result);
			// Provide user-friendly message for common errors
			if (
				errorMsg.includes("Authentication") ||
				errorMsg.includes("authorization") ||
				response.status === 403
			) {
				return {
					status: "error",
					verification_errors: [
						"Custom domains require additional setup. Please contact the platform administrator.",
					],
				};
			}
			return { status: "error", verification_errors: [errorMsg] };
		}

		if (!result.result || result.result.length === 0) {
			return { status: "not_found" };
		}

		const hostnameData = result.result[0];

		return {
			status: hostnameData.status,
			ssl: hostnameData.ssl
				? {
						status: hostnameData.ssl.status,
						validation_method:
							hostnameData.ssl.method || hostnameData.ssl.validation_method,
						validation_errors: hostnameData.ssl.validation_errors || [],
						validation_records: hostnameData.ssl.validation_records || [],
					}
				: undefined,
			verification_errors: hostnameData.verification_errors || [],
		};
	} catch (error) {
		return { status: "error", verification_errors: ["Network error"] };
	}
}

export async function deleteCustomHostname(
	env: Env,
	hostname: string,
): Promise<boolean> {
	if (!isApiConfigured(env)) {
		return false;
	}

	try {
		// First, get the custom hostname ID
		const listResponse = await fetch(
			`https://api.cloudflare.com/client/v4/zones/${env.CLOUDFLARE_ZONE_ID}/custom_hostnames?hostname=${hostname}`,
			{
				headers: getAuthHeaders(env),
			},
		);

		const listResult = await listResponse.json();

		if (
			!listResponse.ok ||
			!listResult.result ||
			listResult.result.length === 0
		) {
			return false;
		}

		const hostnameId = listResult.result[0].id;

		// Delete the custom hostname
		const deleteResponse = await fetch(
			`https://api.cloudflare.com/client/v4/zones/${env.CLOUDFLARE_ZONE_ID}/custom_hostnames/${hostnameId}`,
			{
				method: "DELETE",
				headers: getAuthHeaders(env),
			},
		);

		return deleteResponse.ok;
	} catch (error) {
		return false;
	}
}
