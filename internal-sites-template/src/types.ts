// ── Database record types ────────────────────────────────────────────────────

export type SiteVisibility = "company";

export interface Site {
	id: string;
	name: string;
	slug: string;
	owner_email: string;
	visibility: SiteVisibility;
	created_at: string;
	updated_at: string;
	latest_deployment_id?: string | null;
}

export interface Deployment {
	id: string;
	site_id: string;
	status: "success" | "failed";
	file_count: number;
	total_bytes: number;
	manifest_json: string;
	created_at: string;
	created_by_email: string;
}

// ── Upload types ─────────────────────────────────────────────────────────────

export interface UploadedAsset {
	path: string;
	content: Uint8Array;
	contentType: string;
}

export interface DeployResult {
	deploymentId: string;
	fileCount: number;
	totalBytes: number;
	manifest: Record<string, { hash: string; size: number }>;
}

// ── Generic helpers ──────────────────────────────────────────────────────────

export type ResourceValues = string | number | boolean | null;
export type ResourceRecord = Record<string, ResourceValues>;
