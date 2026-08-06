/**
 * Upload parsing, ZIP extraction, and file validation.
 *
 * Handles both folder uploads (webkitdirectory) and ZIP file uploads.
 * Validates file counts, sizes, and requires an index.html at the root.
 */

import { unzipSync } from "fflate";
import type { UploadedAsset } from "./types";

const MAX_FILES = 1000;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024; // 50 MiB
const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MiB per file

const MIME_TYPES: Record<string, string> = {
	".avif": "image/avif",
	".css": "text/css; charset=utf-8",
	".gif": "image/gif",
	".htm": "text/html; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".ico": "image/x-icon",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".map": "application/json; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".pdf": "application/pdf",
	".png": "image/png",
	".svg": "image/svg+xml",
	".txt": "text/plain; charset=utf-8",
	".wasm": "application/wasm",
	".webp": "image/webp",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".xml": "application/xml; charset=utf-8",
};

// ── Public API ───────────────────────────────────────────────────────────────

export interface ParsedUpload {
	name: string;
	slug: string;
	assets: UploadedAsset[];
}

/**
 * Parse a multipart/form-data request into a validated upload.
 *
 * Expects form fields:
 *   - `name`  (string) - display name for the site
 *   - `slug`  (string) - URL-safe slug
 *   - `paths` (JSON string[]) - relative paths for each file
 *   - `files` (File[]) - the actual file data
 */
export async function parseStaticSiteUpload(
	request: Request,
): Promise<ParsedUpload> {
	const formData = await request.formData();
	const name = getRequiredField(formData, "name");
	const slug = normalizeSlug(getRequiredField(formData, "slug"));
	const paths = JSON.parse(
		formData.get("paths")?.toString() || "[]",
	) as string[];
	const fileParts = (formData.getAll("files") as unknown as File[]).filter(
		(value) => {
			return value && typeof value === "object" && "arrayBuffer" in value;
		},
	);

	if (!slug) {
		throw new Error("Site slug is required");
	}

	if (fileParts.length === 0) {
		throw new Error("Upload must include a folder or ZIP file");
	}

	// Detect ZIP upload: single file ending in .zip
	const zipFile =
		fileParts.length === 1 &&
		fileParts[0].name.toLowerCase().endsWith(".zip")
			? fileParts[0]
			: null;

	const assets = zipFile
		? await assetsFromZip(zipFile)
		: await assetsFromFiles(fileParts, paths);

	validateAssets(assets);

	return { name, slug, assets };
}

/** Normalize a string into a URL-safe slug. */
export function normalizeSlug(value: string): string {
	return value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 63);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getRequiredField(formData: FormData, field: string): string {
	const value = formData.get(field)?.toString().trim();

	if (!value) {
		throw new Error(`${field} is required`);
	}

	return value;
}

async function assetsFromFiles(
	files: File[],
	paths: string[],
): Promise<UploadedAsset[]> {
	const assets = await Promise.all(
		files.map(async (file, index) => {
			const path = paths[index] || file.name;
			const content = new Uint8Array(await file.arrayBuffer());

			return {
				path: normalizeRelativePath(path),
				content,
				contentType: file.type || contentTypeForPath(path),
			};
		}),
	);

	return stripCommonTopLevelFolder(assets);
}

async function assetsFromZip(file: File): Promise<UploadedAsset[]> {
	const zipBytes = new Uint8Array(await file.arrayBuffer());
	const entries = unzipSync(zipBytes);
	const assets: UploadedAsset[] = [];

	for (const [path, content] of Object.entries(entries)) {
		// Skip directories
		if (path.endsWith("/")) {
			continue;
		}

		assets.push({
			path: normalizeRelativePath(path),
			content,
			contentType: contentTypeForPath(path),
		});
	}

	return stripCommonTopLevelFolder(assets);
}

function normalizeRelativePath(path: string): string {
	return path
		.replace(/\\/g, "/")
		.replace(/^\/+/, "")
		.replace(/^\.\//, "");
}

/**
 * If every asset shares the same top-level folder, strip it.
 * This handles the common case where a folder upload wraps everything
 * in a single directory (e.g. "my-site/index.html" -> "index.html").
 */
function stripCommonTopLevelFolder(
	assets: UploadedAsset[],
): UploadedAsset[] {
	const firstSegments = assets
		.map((asset) => asset.path.split("/")[0])
		.filter(Boolean);
	const commonTopLevel = firstSegments[0];

	if (
		!commonTopLevel ||
		!firstSegments.every((segment) => segment === commonTopLevel)
	) {
		return assets;
	}

	const stripped = assets.map((asset) => ({
		...asset,
		path: asset.path.split("/").slice(1).join("/"),
	}));

	// Only strip if the result still has an index.html
	return stripped.some((asset) => asset.path === "index.html")
		? stripped
		: assets;
}

function validateAssets(assets: UploadedAsset[]): void {
	if (assets.length === 0) {
		throw new Error("Upload did not contain any deployable files");
	}

	if (assets.length > MAX_FILES) {
		throw new Error(
			`Upload contains too many files. Maximum is ${MAX_FILES}.`,
		);
	}

	let totalBytes = 0;
	let hasIndex = false;

	for (const asset of assets) {
		totalBytes += asset.content.byteLength;

		if (asset.content.byteLength > MAX_FILE_BYTES) {
			throw new Error(`${asset.path} exceeds the 25 MiB per-file limit`);
		}

		if (asset.path === "index.html" || asset.path === "/index.html") {
			hasIndex = true;
		}
	}

	if (totalBytes > MAX_TOTAL_BYTES) {
		throw new Error("Upload exceeds the 50 MiB total size limit");
	}

	if (!hasIndex) {
		throw new Error("Static site must include a root index.html file");
	}
}

function contentTypeForPath(path: string): string {
	const lower = path.toLowerCase();
	const extension = Object.keys(MIME_TYPES).find((ext) =>
		lower.endsWith(ext),
	);

	return extension ? MIME_TYPES[extension] : "application/octet-stream";
}
