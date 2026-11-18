/**
 * D1 database layer.
 *
 * Tables are auto-created on first request via CREATE TABLE IF NOT EXISTS.
 * No separate migration step is needed.
 */

import type { Deployment, ResourceRecord, Site } from "./types";

// ── Schema bootstrap ─────────────────────────────────────────────────────────

/**
 * Create all tables if they do not exist. Safe to call on every request
 * (guarded by an in-memory flag in the caller).
 */
export async function Initialize(db: D1Database): Promise<void> {
	await db.batch([
		db.prepare(`CREATE TABLE IF NOT EXISTS sites (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			slug TEXT UNIQUE NOT NULL,
			owner_email TEXT NOT NULL,
			visibility TEXT NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			latest_deployment_id TEXT
		)`),
		db.prepare(`CREATE TABLE IF NOT EXISTS deployments (
			id TEXT PRIMARY KEY,
			site_id TEXT NOT NULL,
			status TEXT NOT NULL,
			file_count INTEGER NOT NULL,
			total_bytes INTEGER NOT NULL,
			manifest_json TEXT NOT NULL,
			created_at TEXT NOT NULL,
			created_by_email TEXT NOT NULL
		)`),
		db.prepare(`CREATE TABLE IF NOT EXISTS site_acl (
			site_id TEXT NOT NULL,
			principal_type TEXT NOT NULL,
			principal_value TEXT NOT NULL,
			created_at TEXT NOT NULL,
			PRIMARY KEY (site_id, principal_type, principal_value)
		)`),
	]);
}

/** Check whether the sites table already exists. */
export async function HasSitesTable(db: D1Database): Promise<boolean> {
	const row = await db
		.prepare(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sites'",
		)
		.first();
	return Boolean(row);
}

// ── Queries ──────────────────────────────────────────────────────────────────

/** Fetch all rows from a known table (admin view). */
export async function FetchTable(
	db: D1Database,
	table: string,
): Promise<ResourceRecord[]> {
	if (!["sites", "deployments", "site_acl"].includes(table)) {
		throw new Error(`Unsupported table: ${table}`);
	}

	const result = await db
		.prepare(`SELECT * FROM ${table}`)
		.all<ResourceRecord>();
	return result.results || [];
}

// ── Sites ────────────────────────────────────────────────────────────────────

export async function CreateSite(db: D1Database, site: Site): Promise<void> {
	await db
		.prepare(
			`INSERT INTO sites (
				id, name, slug, owner_email, visibility,
				created_at, updated_at, latest_deployment_id
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.bind(
			site.id,
			site.name,
			site.slug,
			site.owner_email,
			site.visibility,
			site.created_at,
			site.updated_at,
			site.latest_deployment_id || null,
		)
		.run();
}

export async function GetSiteBySlug(
	db: D1Database,
	slug: string,
): Promise<Site | null> {
	return await db
		.prepare("SELECT * FROM sites WHERE slug = ?")
		.bind(slug)
		.first<Site>();
}

export async function UpdateSite(
	db: D1Database,
	siteId: string,
	updates: Pick<Partial<Site>, "latest_deployment_id" | "updated_at">,
): Promise<void> {
	await db
		.prepare(
			"UPDATE sites SET latest_deployment_id = ?, updated_at = ? WHERE id = ?",
		)
		.bind(
			updates.latest_deployment_id || null,
			updates.updated_at || new Date().toISOString(),
			siteId,
		)
		.run();
}

export async function DeleteSite(
	db: D1Database,
	siteId: string,
): Promise<void> {
	await db.prepare("DELETE FROM sites WHERE id = ?").bind(siteId).run();
}

// ── Admin queries ────────────────────────────────────────────────────────────

export interface DeploymentWithSite {
	id: string;
	site_name: string;
	site_slug: string;
	file_count: number;
	total_bytes: number;
	created_by_email: string;
	created_at: string;
}

/** Fetch all deployments joined with their parent site, newest first. */
export async function FetchDeploymentsWithSites(
	db: D1Database,
): Promise<DeploymentWithSite[]> {
	const result = await db
		.prepare(
			`SELECT d.id, s.name as site_name, s.slug as site_slug,
			        d.file_count, d.total_bytes, d.created_by_email, d.created_at
			 FROM deployments d
			 JOIN sites s ON d.site_id = s.id
			 ORDER BY d.created_at DESC`,
		)
		.all<DeploymentWithSite>();
	return result.results || [];
}

// ── Deployments ──────────────────────────────────────────────────────────────

export async function CreateDeployment(
	db: D1Database,
	deployment: Deployment,
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO deployments (
				id, site_id, status, file_count, total_bytes,
				manifest_json, created_at, created_by_email
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.bind(
			deployment.id,
			deployment.site_id,
			deployment.status,
			deployment.file_count,
			deployment.total_bytes,
			deployment.manifest_json,
			deployment.created_at,
			deployment.created_by_email,
		)
		.run();
}
