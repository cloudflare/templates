// Copyright (c) 2022 Cloudflare, Inc.
// Licensed under the APACHE LICENSE, VERSION 2.0 license found in the LICENSE file or at http://www.apache.org/licenses/LICENSE-2.0

import { Env } from "./env";

const BaseURI = (env: Env) =>
	`https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/workers`;
const ScriptsURI = (env: Env) =>
	`${BaseURI(env)}/dispatch/namespaces/${env.DISPATCH_NAMESPACE_NAME}/scripts`;
const MakeHeaders = (env: Env): Record<string, string> => {
	if (env.DISPATCH_NAMESPACE_API_TOKEN) {
		return {
			Authorization: `Bearer ${env.DISPATCH_NAMESPACE_API_TOKEN}`,
		};
	}
	console.error("DISPATCH_NAMESPACE_API_TOKEN is not set!");
	return {};
};

// Debug helper to check env vars
export function checkEnvConfig(env: Env): { ok: boolean; missing: string[] } {
	const missing: string[] = [];
	if (!env.ACCOUNT_ID) missing.push("ACCOUNT_ID");
	if (!env.DISPATCH_NAMESPACE_API_TOKEN)
		missing.push("DISPATCH_NAMESPACE_API_TOKEN");
	if (!env.DISPATCH_NAMESPACE_NAME) missing.push("DISPATCH_NAMESPACE_NAME");
	return { ok: missing.length === 0, missing };
}

export async function GetScriptsInDispatchNamespace(env: Env) {
	const data = (await (
		await fetch(ScriptsURI(env), {
			method: "GET",
			headers: MakeHeaders(env),
		})
	).json()) as {
		result: Array<{ id: string; modified_on: string; created_on: string }>;
	};
	return data.result;
}

export async function PutScriptInDispatchNamespace(
	env: Env,
	scriptName: string,
	scriptContent: string,
): Promise<Response> {
	const scriptFileName = `${scriptName}.mjs`;

	const formData = new FormData();
	const metadata = {
		main_module: scriptFileName,
	};
	formData.append(
		"metadata",
		new File([JSON.stringify(metadata)], "metadata.json", {
			type: "application/json",
		}),
	);

	formData.append(
		"script",
		new File([scriptContent], scriptFileName, {
			type: "application/javascript+module",
		}),
	);

	return await fetch(`${ScriptsURI(env)}/${scriptName}`, {
		method: "PUT",
		body: formData,
		headers: {
			...MakeHeaders(env),
		},
	});
}

// Asset file interface
export interface AssetFile {
	path: string; // e.g., "index.html" or "css/style.css"
	content: string; // base64 encoded content
	size: number; // original file size in bytes
}

// Hash function - SHA-256 truncated to 16 bytes (32 hex chars) per docs
async function hashContent(base64Content: string): Promise<string> {
	const binaryString = atob(base64Content);
	const bytes = new Uint8Array(binaryString.length);
	for (let i = 0; i < binaryString.length; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}
	const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	// Use first 16 bytes (32 hex chars) per docs requirement
	return hashArray
		.slice(0, 16)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

// Upload static assets using Workers Assets API and deploy worker
export async function PutScriptWithAssetsInDispatchNamespace(
	env: Env,
	scriptName: string,
	assets: AssetFile[],
): Promise<{ success: boolean; error?: string }> {
	const scriptFileName = `${scriptName}.mjs`;

	try {
		// Step 1: Build manifest with 32-char hashes
		const manifest: Record<string, { hash: string; size: number }> = {};
		const hashToAsset: Map<string, AssetFile> = new Map();

		for (const asset of assets) {
			const hash = await hashContent(asset.content);
			// Ensure leading slash for path
			const path = asset.path.startsWith("/") ? asset.path : "/" + asset.path;
			manifest[path] = { hash, size: asset.size };
			hashToAsset.set(hash, asset);
		}

		// Step 2: Create upload session
		const sessionUrl = `${BaseURI(env)}/dispatch/namespaces/${env.DISPATCH_NAMESPACE_NAME}/scripts/${scriptName}/assets-upload-session`;

		const sessionResponse = await fetch(sessionUrl, {
			method: "POST",
			headers: {
				...MakeHeaders(env),
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ manifest }),
		});

		const sessionData = (await sessionResponse.json()) as {
			success: boolean;
			result?: {
				jwt: string;
				buckets?: string[][];
			};
			errors?: Array<{ message: string }>;
		};

		if (!sessionData.success || !sessionData.result) {
			const errorMsg =
				sessionData.errors?.[0]?.message || "Failed to create upload session";
			return { success: false, error: errorMsg };
		}

		let completionToken = sessionData.result.jwt;
		const buckets = sessionData.result.buckets;

		// Step 3: Upload assets in buckets if needed
		if (buckets && buckets.length > 0) {
			const uploadUrl = `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/workers/assets/upload?base64=true`;

			for (let i = 0; i < buckets.length; i++) {
				const bucket = buckets[i];

				const payload = new FormData();
				for (const hash of bucket) {
					const asset = hashToAsset.get(hash);
					if (asset) {
						// Send base64 content directly as the field value
						payload.append(hash, asset.content);
					}
				}

				const uploadResponse = await fetch(uploadUrl, {
					method: "POST",
					headers: {
						Authorization: `Bearer ${completionToken}`,
					},
					body: payload,
				});

				const uploadData = (await uploadResponse.json()) as {
					success: boolean;
					result?: { jwt?: string };
					errors?: Array<{ message: string }>;
				};

				if (!uploadResponse.ok || !uploadData.success) {
					const errorMsg =
						uploadData.errors?.[0]?.message || "Asset upload failed";
					return { success: false, error: errorMsg };
				}

				// Get the new JWT for subsequent requests
				if (uploadData.result?.jwt) {
					completionToken = uploadData.result.jwt;
				}
			}
		}

		// Step 4: Deploy worker with assets binding

		// Simple worker that uses ASSETS binding
		const workerCode = `
export default {
  async fetch(request, env, ctx) {
    // Pass through to ASSETS binding which handles routing automatically
    return env.ASSETS.fetch(request);
  }
};
`;

		const formData = new FormData();

		// Metadata with completion token and assets config
		const metadata = {
			main_module: scriptFileName,
			assets: {
				jwt: completionToken,
				config: {
					html_handling: "auto-trailing-slash",
				},
			},
			bindings: [
				{
					type: "assets",
					name: "ASSETS",
				},
			],
			compatibility_date: "2025-01-24",
		};

		formData.append(
			"metadata",
			new File([JSON.stringify(metadata)], "metadata.json", {
				type: "application/json",
			}),
		);
		formData.append(
			scriptFileName,
			new File([workerCode], scriptFileName, {
				type: "application/javascript+module",
			}),
		);

		const deployResponse = await fetch(`${ScriptsURI(env)}/${scriptName}`, {
			method: "PUT",
			body: formData,
			headers: {
				...MakeHeaders(env),
			},
		});

		const deployData = (await deployResponse.json()) as {
			success: boolean;
			errors?: Array<{ message: string }>;
		};

		if (!deployResponse.ok || !deployData.success) {
			const errorMsg =
				deployData.errors?.[0]?.message || "Failed to deploy worker";
			return { success: false, error: errorMsg };
		}

		return { success: true };
	} catch (error) {
		console.error("Asset upload error:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

export async function DeleteScriptInDispatchNamespace(
	env: Env,
	scriptName: string,
): Promise<Response> {
	return await fetch(`${ScriptsURI(env)}/${scriptName}`, {
		method: "DELETE",
		headers: MakeHeaders(env),
	});
}
