/**
 * Cloudflare API integration for deploying static sites into the dispatch namespace.
 *
 * Uses the 3-step static asset upload flow:
 *   1. Create an upload session (returns JWT + buckets)
 *   2. Upload file contents to each bucket
 *   3. Deploy a Worker with the completion JWT (assets bound automatically)
 */

import type { Env } from "./env";
import type { DeployResult, UploadedAsset } from "./types";

// ── API helpers ──────────────────────────────────────────────────────────────

const BaseURI = (env: Env) =>
	`https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/workers`;

const ScriptsURI = (env: Env) =>
	`${BaseURI(env)}/dispatch/namespaces/${env.DISPATCH_NAMESPACE_NAME}/scripts`;

const AuthHeaders = (env: Env) => ({
	Authorization: `Bearer ${env.DISPATCH_NAMESPACE_API_TOKEN}`,
});

// ── Types ────────────────────────────────────────────────────────────────────

type AssetManifest = Record<string, { hash: string; size: number }>;

interface AssetsUploadSessionResult {
	jwt: string;
	buckets?: string[][];
}

interface CloudflareApiResponse<T> {
	success: boolean;
	result: T;
	errors?: Array<{ message?: string }>;
}

// ── Stub Worker ──────────────────────────────────────────────────────────────

/**
 * Minimal Worker script deployed alongside static assets.
 * The static asset binding handles all file serving; this is just a fallback.
 */
const STATIC_ASSET_WORKER = `export default {
	async fetch() {
		return new Response("Not found", { status: 404 });
	}
};
`;

// ── Public API ───────────────────────────────────────────────────────────────

/** List all scripts in the dispatch namespace. */
export async function GetScriptsInDispatchNamespace(env: Env) {
	const data = (await (
		await fetch(ScriptsURI(env), {
			method: "GET",
			headers: AuthHeaders(env),
		})
	).json()) as {
		result: Array<{
			id: string;
			modified_on: string;
			created_on: string;
		}>;
	};
	return data.result;
}

/** Delete a script from the dispatch namespace. */
export async function DeleteScriptInDispatchNamespace(
	env: Env,
	scriptName: string,
): Promise<Response> {
	return await fetch(`${ScriptsURI(env)}/${scriptName}`, {
		method: "DELETE",
		headers: AuthHeaders(env),
	});
}

/**
 * Deploy a static site into the dispatch namespace.
 *
 * Executes the 3-step flow:
 *   1. Build manifest and create upload session
 *   2. Upload assets to returned buckets
 *   3. Deploy Worker with assets JWT
 */
export async function PutStaticSiteInDispatchNamespace(
	env: Env,
	scriptName: string,
	assets: UploadedAsset[],
): Promise<DeployResult> {
	if (assets.length === 0) {
		throw new Error("Upload must include at least one file");
	}

	const normalizedAssets = normalizeAssets(assets);
	const manifest = await buildAssetManifest(scriptName, normalizedAssets);
	const uploadSession = await createAssetsUploadSession(
		env,
		scriptName,
		manifest,
	);

	// Build a hash -> asset lookup for bucket uploads
	const assetsByHash = new Map<string, UploadedAsset>();
	for (const asset of normalizedAssets) {
		assetsByHash.set(manifest[asset.path].hash, asset);
	}

	// Upload each bucket and track the latest completion JWT
	let completionJwt = uploadSession.jwt;
	for (const bucket of uploadSession.buckets || []) {
		completionJwt = await uploadAssetBucket(
			env,
			bucket,
			assetsByHash,
			uploadSession.jwt,
		);
	}

	// Deploy the Worker with the completion JWT
	await putStaticAssetWorker(env, scriptName, completionJwt);

	const totalBytes = normalizedAssets.reduce(
		(sum, asset) => sum + asset.content.byteLength,
		0,
	);

	return {
		deploymentId: `deployment-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
		fileCount: normalizedAssets.length,
		totalBytes,
		manifest,
	};
}

// ── Asset normalization ──────────────────────────────────────────────────────

function normalizeAssets(assets: UploadedAsset[]): UploadedAsset[] {
	const seen = new Set<string>();
	const normalized: UploadedAsset[] = [];

	for (const asset of assets) {
		const path = normalizeAssetPath(asset.path);

		if (!path || path.endsWith("/")) {
			continue;
		}

		if (path.includes("/../") || path === "/..") {
			throw new Error(`Invalid asset path: ${asset.path}`);
		}

		if (seen.has(path)) {
			throw new Error(`Duplicate asset path: ${path}`);
		}

		seen.add(path);
		normalized.push({ ...asset, path });
	}

	if (!seen.has("/index.html")) {
		throw new Error(
			"Static site must include an index.html file at the root",
		);
	}

	return normalized;
}

function normalizeAssetPath(path: string): string {
	const withoutBackslashes = path.replace(/\\/g, "/");
	const stripped = withoutBackslashes
		.replace(/^\/+/, "")
		.replace(/^\.\//, "");
	const parts = stripped.split("/").filter((part) => part && part !== ".");

	return `/${parts.join("/")}`;
}

// ── Manifest & hashing ──────────────────────────────────────────────────────

async function buildAssetManifest(
	scriptName: string,
	assets: UploadedAsset[],
): Promise<AssetManifest> {
	const manifest: AssetManifest = {};

	for (const asset of assets) {
		manifest[asset.path] = {
			hash: await hashAsset(scriptName, asset),
			size: asset.content.byteLength,
		};
	}

	return manifest;
}

/**
 * SHA-256 hash salted with the script name and asset path.
 * Truncated to 32 hex chars (16 bytes) per the CF API spec.
 * The salt ensures asset isolation between sites in the namespace.
 */
async function hashAsset(
	scriptName: string,
	asset: UploadedAsset,
): Promise<string> {
	const prefix = new TextEncoder().encode(
		`${scriptName}\0${asset.path}\0`,
	);
	const bytes = new Uint8Array(
		prefix.byteLength + asset.content.byteLength,
	);
	bytes.set(prefix, 0);
	bytes.set(asset.content, prefix.byteLength);

	const digest = await crypto.subtle.digest("SHA-256", bytes);

	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("")
		.slice(0, 32);
}

// ── Upload session ───────────────────────────────────────────────────────────

async function createAssetsUploadSession(
	env: Env,
	scriptName: string,
	manifest: AssetManifest,
): Promise<AssetsUploadSessionResult> {
	const response = await fetch(
		`${ScriptsURI(env)}/${scriptName}/assets-upload-session`,
		{
			method: "POST",
			headers: {
				...AuthHeaders(env),
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ manifest }),
		},
	);

	const data = await readCloudflareResponse<AssetsUploadSessionResult>(
		response,
		"Could not create asset upload session",
	);

	if (!data.success) {
		throw new Error(
			formatCloudflareError(
				"Could not create asset upload session",
				data,
			),
		);
	}

	return data.result;
}

// ── Bucket upload ────────────────────────────────────────────────────────────

async function uploadAssetBucket(
	env: Env,
	bucket: string[],
	assetsByHash: Map<string, UploadedAsset>,
	uploadJwt: string,
): Promise<string> {
	const formData = new FormData();

	for (const hash of bucket) {
		const asset = assetsByHash.get(hash);

		if (!asset) {
			throw new Error(`Asset bucket referenced unknown hash ${hash}`);
		}

		formData.append(hash, bytesToBase64(asset.content));
	}

	const response = await fetch(
		`${BaseURI(env)}/assets/upload?base64=true`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${uploadJwt}`,
			},
			body: formData,
		},
	);

	const data = await readCloudflareResponse<{ jwt: string }>(
		response,
		"Could not upload static assets",
	);

	if (!data.success) {
		throw new Error(
			formatCloudflareError("Could not upload static assets", data),
		);
	}

	return data.result.jwt;
}

// ── Worker deploy ────────────────────────────────────────────────────────────

async function putStaticAssetWorker(
	env: Env,
	scriptName: string,
	assetJwt: string,
): Promise<void> {
	const scriptFileName = "index.js";
	const formData = new FormData();

	const metadata = {
		main_module: scriptFileName,
		compatibility_date: "2025-10-08",
		assets: {
			jwt: assetJwt,
			config: {
				html_handling: "auto-trailing-slash",
				not_found_handling: "404-page",
			},
		},
	};

	formData.append(
		"metadata",
		new File([JSON.stringify(metadata)], "metadata.json", {
			type: "application/json",
		}),
	);

	formData.append(
		scriptFileName,
		new File([STATIC_ASSET_WORKER], scriptFileName, {
			type: "application/javascript+module",
		}),
	);

	const response = await fetch(`${ScriptsURI(env)}/${scriptName}`, {
		method: "PUT",
		body: formData,
		headers: AuthHeaders(env),
	});

	if (!response.ok) {
		const data = await readCloudflareResponse<unknown>(
			response,
			"Could not deploy static site Worker",
		).catch(() => null);
		throw new Error(
			data
				? formatCloudflareError(
						"Could not deploy static site Worker",
						data,
					)
				: "Could not deploy static site Worker",
		);
	}
}

// ── Response parsing ─────────────────────────────────────────────────────────

async function readCloudflareResponse<T>(
	response: Response,
	context: string,
): Promise<CloudflareApiResponse<T>> {
	const text = await response.text();

	let data: CloudflareApiResponse<T> | null = null;

	try {
		data = JSON.parse(text) as CloudflareApiResponse<T>;
	} catch {
		throw new Error(
			`${context}: ${response.status} ${text.slice(0, 300)}`,
		);
	}

	if (!response.ok) {
		throw new Error(
			formatCloudflareError(`${context}: ${response.status}`, data),
		);
	}

	return data;
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	const chunkSize = 0x8000;

	for (let i = 0; i < bytes.length; i += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
	}

	return btoa(binary);
}

function formatCloudflareError<T>(
	message: string,
	data: CloudflareApiResponse<T>,
): string {
	const errors = data.errors
		?.map((error) => error.message)
		.filter(Boolean)
		.join("; ");
	return errors ? `${message}: ${errors}` : message;
}
