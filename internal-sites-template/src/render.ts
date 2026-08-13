/**
 * Admin HTML table builder.
 *
 * Renders D1 query results as HTML tables for the /admin page.
 * Curated renderers for Sites and Deployments produce linked,
 * human-readable output. BuildTable() handles the generic case
 * (dispatch namespace scripts).
 */

import type { DeploymentWithSite } from "./db";
import { escapeHtml } from "./html";
import type { ResourceValues, Site } from "./types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function emptyState(message: string): string {
	return `<p class="admin-empty">${escapeHtml(message)}</p>`;
}

// ── Curated renderers ────────────────────────────────────────────────────────

/** Render the Sites table with site name linked to the live URL. */
export function BuildSitesTable(
	sites: Site[],
	siteUrl: (slug: string) => string,
): string {
	if (!sites.length) {
		return emptyState("No sites deployed yet.");
	}

	const rows = sites
		.map((site) => {
			const url = escapeHtml(siteUrl(site.slug));
			return `<tr>
				<td><a class="admin-link" href="${url}" target="_blank" rel="noreferrer">${escapeHtml(site.name)}</a></td>
				<td>${escapeHtml(site.owner_email)}</td>
				<td class="admin-mono">${escapeHtml(site.updated_at.replace("T", " ").replace(/\.\d{3}Z$/, " UTC"))}</td>
			</tr>`;
		})
		.join("");

	return `<div class="admin-table-wrap">
		<table class="admin-table">
			<thead><tr>
				<th>Site name</th>
				<th>Owner</th>
				<th>Last updated</th>
			</tr></thead>
			<tbody>${rows}</tbody>
		</table>
	</div>`;
}

/** Render the Deployments table with site name linked to the live URL. */
export function BuildDeploymentsTable(
	deployments: DeploymentWithSite[],
	siteUrl: (slug: string) => string,
): string {
	if (!deployments.length) {
		return emptyState("No deployments yet.");
	}

	const rows = deployments
		.map((d) => {
			const url = escapeHtml(siteUrl(d.site_slug));
			return `<tr>
				<td><a class="admin-link" href="${url}" target="_blank" rel="noreferrer">${escapeHtml(d.site_name)}</a></td>
				<td class="admin-num">${d.file_count.toLocaleString()}</td>
				<td class="admin-num">${escapeHtml(formatBytes(d.total_bytes))}</td>
				<td>${escapeHtml(d.created_by_email)}</td>
				<td class="admin-mono">${escapeHtml(d.created_at.replace("T", " ").replace(/\.\d{3}Z$/, " UTC"))}</td>
			</tr>`;
		})
		.join("");

	return `<div class="admin-table-wrap">
		<table class="admin-table">
			<thead><tr>
				<th>Site</th>
				<th>Files</th>
				<th>Size</th>
				<th>Deployed by</th>
				<th>Deployed at</th>
			</tr></thead>
			<tbody>${rows}</tbody>
		</table>
	</div>`;
}

/** Generic table renderer — used for the dispatch namespace scripts list. */
export function BuildTable(
	name: string,
	dataRows: Record<string, string | number | boolean | null>[] | undefined,
	columns?: string[],
): string {
	if (!dataRows?.length) {
		return emptyState(`No scripts in namespace "${escapeHtml(name)}".`);
	}

	const cols = columns || Object.keys(dataRows[0]);
	const head = cols.map((c) => `<th>${escapeHtml(c)}</th>`).join("");
	const body = dataRows
		.map(
			(row) =>
				`<tr>${cols.map((c) => `<td class="admin-mono">${resourceValueToString(row[c])}</td>`).join("")}</tr>`,
		)
		.join("");

	return `<div class="admin-table-wrap">
		<table class="admin-table">
			<thead><tr>${head}</tr></thead>
			<tbody>${body}</tbody>
		</table>
	</div>`;
}

function resourceValueToString(value: ResourceValues): string {
	if (value == null) return '<span class="admin-null">—</span>';
	return escapeHtml(value.toString());
}
