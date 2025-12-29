// Copyright (c) 2022 Cloudflare, Inc.
// Licensed under the APACHE LICENSE, VERSION 2.0 license found in the LICENSE file or at http://www.apache.org/licenses/LICENSE-2.0

import { ResourceValues } from "./types";

function ResourceValueToString(value: ResourceValues, columnName?: string) {
	if (value == null) return "null";

	const stringValue = value.toString();

	// Special handling for script_content column
	if (columnName === "script_content" && stringValue.length > 100) {
		const truncated = stringValue.substring(0, 100) + "...";
		return `<div class="script-preview" title="${escapeHtml(stringValue)}">${escapeHtml(truncated)}</div>`;
	}

	// HTML escape all content to prevent rendering issues
	return escapeHtml(stringValue);
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

export function BuildTable(
	name: string,
	dataRows: Record<string, string | number | boolean | null>[] | undefined,
): string {
	if (!dataRows?.length) {
		return `<div class="dataContainer"><h3>${escapeHtml(name)}</h3><p style="color: var(--kumo-muted-foreground);">No data</p></div>`;
	}
	const columns = Object.keys(dataRows[0]);
	const headerRow = `<tr>${columns.map((col) => `<th>${escapeHtml(col)}</th>`).join("")}</tr>`;
	const dataRowsHtml = dataRows
		.map(
			(row) =>
				`<tr>${columns.map((col) => `<td>${ResourceValueToString(row[col], col)}</td>`).join("")}</tr>`,
		)
		.join("");

	const table = `<table class="dataTable">${headerRow}${dataRowsHtml}</table>`;
	return `<div class="dataContainer">${table}</div>`;
}

export const CSS = `
:root {
  /* Kumo Design System Colors */
  --kumo-surface: #fff;
  --kumo-surface-foreground: #000;
  --kumo-surface-secondary: oklch(98.5% 0 0);
  --kumo-surface-active: oklch(97% 0 0);
  --kumo-primary: #056dff;
  --kumo-primary-foreground: #fff;
  --kumo-secondary: #fff;
  --kumo-secondary-foreground: oklch(20.5% 0 0);
  --kumo-secondary-hover: oklch(98.5% 0 0);
  --kumo-accent: oklch(96% 0 0);
  --kumo-destructive: oklch(57.7% .245 27.325);
  --kumo-destructive-foreground: oklch(98.5% 0 0);
  --kumo-muted: oklch(97% 0 0);
  --kumo-muted-foreground: oklch(55.6% 0 0);
  --kumo-border: oklch(92.2% 0 0);
  --kumo-border-hover: oklch(87% 0 0);
  --kumo-border-active: oklch(70.8% 0 0);
  --kumo-text-error: oklch(57.7% .245 27.325);
  --kumo-success: oklch(62.7% .194 149.214);
  --kumo-success-surface: oklch(72.3% .219 149.579 / 0.15);
  --kumo-warning: oklch(79.5% .184 86.047);
  --kumo-warning-surface: oklch(79.5% .184 86.047 / 0.15);
  --kumo-info: oklch(62.3% .214 259.815);
  --kumo-info-surface: oklch(62.3% .214 259.815 / 0.15);
  --kumo-error-surface: oklch(63.7% .237 25.331 / 0.15);
  
  /* Spacing */
  --spacing: 0.25rem;
  
  /* Border radius */
  --radius-sm: 0.25rem;
  --radius-md: 0.375rem;
  --radius-lg: 0.5rem;
  --radius-xl: 0.75rem;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
  font-size: 14px;
  font-weight: 400;
  background-color: var(--kumo-surface-secondary);
  color: var(--kumo-surface-foreground);
  line-height: 1.5;
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
}

h1, h2, h3, h4, h5, h6 {
  font-weight: 600;
  color: var(--kumo-surface-foreground);
  letter-spacing: -0.01em;
}

.header {
  padding-bottom: 24px;
  border-bottom: 1px solid var(--kumo-border);
  margin-bottom: 24px;
}

.header h1 {
  font-size: 1.875rem;
  font-weight: 600;
  margin: 0 0 8px 0;
  line-height: 1.25;
}

.header p {
  color: var(--kumo-muted-foreground);
  font-size: 14px;
  margin: 0;
}

.header a {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 16px;
  background-color: var(--kumo-primary);
  color: var(--kumo-primary-foreground);
  text-decoration: none;
  border: none;
  border-radius: var(--radius-md);
  font-weight: 500;
  font-size: 13px;
  margin-right: 8px;
  transition: background-color 0.1s ease;
}

.header a:hover {
  background-color: oklch(48.8% .243 264.376);
}

.header input {
  padding: 10px 12px;
  border: 1px solid var(--kumo-border);
  border-radius: var(--radius-md);
  font-size: 14px;
  margin-right: 8px;
  background-color: var(--kumo-surface);
  color: var(--kumo-surface-foreground);
  transition: border-color 0.1s ease, box-shadow 0.1s ease;
}

.header input:focus {
  outline: none;
  border-color: var(--kumo-primary);
  box-shadow: 0 0 0 3px oklch(62.3% .214 259.815 / 0.15);
}

.header button {
  padding: 10px 16px;
  background-color: var(--kumo-primary);
  color: var(--kumo-primary-foreground);
  border: none;
  border-radius: var(--radius-md);
  font-weight: 500;
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.1s ease;
}

.header button:hover {
  background-color: oklch(48.8% .243 264.376);
}

hr.solid {
  border: none;
  border-top: 1px solid var(--kumo-border);
  margin: 24px 0;
}

.dataContainer {
  padding: 20px;
  max-width: 100%;
  background-color: var(--kumo-surface);
  border: 1px solid var(--kumo-border);
  border-radius: var(--radius-lg);
  margin-bottom: 20px;
  overflow-x: auto;
  box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.05);
}

.dataContainer h3 {
  margin-top: 0;
  margin-bottom: 16px;
  font-size: 16px;
  font-weight: 600;
}

.dataTable {
  border-collapse: collapse;
  width: 100%;
  font-size: 13px;
}

.dataTable td, .dataTable th {
  border-bottom: 1px solid var(--kumo-border);
  padding: 12px;
  text-align: left;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.script-preview {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
  background-color: var(--kumo-accent);
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  cursor: help;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dataTable td:last-child, .dataTable th:last-child {
  border-right: none;
}

.dataTable tr:last-child td {
  border-bottom: none;
}

.dataTable tr:hover { 
  background-color: var(--kumo-surface-active);
}

.dataTable th {
  background-color: var(--kumo-accent);
  color: var(--kumo-surface-foreground);
  font-weight: 500;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.form-container {
  background-color: var(--kumo-surface);
  border: 1px solid var(--kumo-border);
  border-radius: var(--radius-lg);
  padding: 24px;
  margin-bottom: 20px;
  box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.05);
}

.form-container h3 {
  margin-top: 0;
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 20px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
  font-size: 13px;
  color: var(--kumo-surface-foreground);
}

.form-group input, .form-group textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--kumo-border);
  border-radius: var(--radius-md);
  font-size: 14px;
  font-family: inherit;
  transition: border-color 0.1s ease, box-shadow 0.1s ease;
  background-color: var(--kumo-surface);
  color: var(--kumo-surface-foreground);
}

.form-group input:focus, .form-group textarea:focus {
  outline: none;
  border-color: var(--kumo-primary);
  box-shadow: 0 0 0 3px oklch(62.3% .214 259.815 / 0.15);
}

.form-group input:hover, .form-group textarea:hover {
  border-color: var(--kumo-border-hover);
}

.form-group textarea {
  resize: vertical;
  min-height: 120px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 13px;
  line-height: 1.5;
}

.form-group small {
  display: block;
  color: var(--kumo-muted-foreground);
  font-size: 12px;
  margin-top: 6px;
}

/* Kumo Button Variants */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 36px;
  padding: 0 12px;
  border: none;
  border-radius: var(--radius-lg);
  font-weight: 500;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.1s ease, opacity 0.1s ease;
  user-select: none;
  flex-shrink: 0;
  white-space: nowrap;
}

.btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--kumo-border-active);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Primary Button (default) */
.btn-primary, .btn {
  background-color: var(--kumo-primary);
  color: var(--kumo-primary-foreground);
}

.btn-primary:hover:not(:disabled), .btn:hover:not(:disabled) {
  background-color: oklch(48.8% .243 264.376);
}

/* Secondary Button */
.btn-secondary {
  background-color: var(--kumo-secondary);
  color: var(--kumo-secondary-foreground);
  box-shadow: inset 0 0 0 1px var(--kumo-border);
}

.btn-secondary:hover:not(:disabled) {
  background-color: var(--kumo-secondary-hover);
  box-shadow: inset 0 0 0 1px var(--kumo-border-hover);
}

.btn-secondary.copied {
  color: var(--kumo-success);
}

/* Ghost Button */
.btn-ghost {
  background-color: transparent;
  color: var(--kumo-surface-foreground);
}

.btn-ghost:hover:not(:disabled) {
  background-color: var(--kumo-accent);
}

/* Destructive Button */
.btn-destructive {
  background-color: var(--kumo-destructive);
  color: var(--kumo-destructive-foreground);
}

.btn-destructive:hover:not(:disabled) {
  background-color: oklch(50.5% .213 27.518);
}

/* Success Button */
.btn-success {
  background-color: var(--kumo-success);
  color: #fff;
}

.btn-success:hover:not(:disabled) {
  background-color: oklch(55% .18 149.214);
}

/* Button Sizes */
.btn-sm {
  height: 26px;
  padding: 0 8px;
  font-size: 12px;
  border-radius: var(--radius-md);
}

/* Icon-only button */
.btn-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--kumo-muted-foreground);
  cursor: pointer;
  transition: background-color 0.1s ease, color 0.1s ease;
}

.btn-icon:hover {
  background-color: var(--kumo-accent);
  color: var(--kumo-surface-foreground);
}

.btn-icon.copied {
  color: var(--kumo-success);
}

.btn-lg {
  height: 40px;
  padding: 0 16px;
  font-size: 14px;
}

/* Clipboard Text Component */
.clipboard-text {
  display: flex;
  align-items: center;
  background-color: var(--kumo-surface);
  border: 1px solid var(--kumo-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
}

.clipboard-text-value {
  flex: 1;
  padding: 10px 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.clipboard-text-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 0 12px;
  background: transparent;
  border: none;
  border-left: 1px solid var(--kumo-border);
  cursor: pointer;
  color: var(--kumo-muted-foreground);
  transition: background-color 0.1s ease, color 0.1s ease;
}

.clipboard-text-btn:hover {
  background-color: var(--kumo-accent);
  color: var(--kumo-surface-foreground);
}

.clipboard-text-btn.copied {
  color: var(--kumo-success);
}

.clipboard-text-btn svg {
  width: 16px;
  height: 16px;
}

/* DNS Table */
.dns-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  margin: 12px 0;
  background: var(--kumo-surface);
  border: 1px solid var(--kumo-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.dns-table th,
.dns-table td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid var(--kumo-border);
}

.dns-table th {
  font-weight: 500;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--kumo-muted-foreground);
  background-color: var(--kumo-accent);
}

.dns-table td {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.dns-table tr:last-child td {
  border-bottom: none;
}

/* Collapsible/Expandable */
.collapsible-trigger {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--kumo-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  user-select: none;
  background: none;
  border: none;
  padding: 0;
}

.collapsible-trigger:hover {
  text-decoration: underline;
}

.collapsible-trigger svg {
  width: 16px;
  height: 16px;
  transition: transform 0.2s ease;
}

.collapsible-trigger.open svg {
  transform: rotate(180deg);
}

.collapsible-content {
  display: none;
  margin-top: 12px;
  padding-left: 16px;
  border-left: 2px solid var(--kumo-border);
}

.collapsible-content.open {
  display: block;
}

/* Kumo Banner Component */
.banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: var(--radius-lg);
  font-size: 14px;
  width: 100%;
}

.banner-info {
  background-color: var(--kumo-info-surface);
  border: 1px solid var(--kumo-info);
  color: oklch(42.4% .199 265.638);
}

.banner-success {
  background-color: var(--kumo-success-surface);
  border: 1px solid var(--kumo-success);
  color: oklch(45% .18 149.214);
}

.banner-warning {
  background-color: var(--kumo-warning-surface);
  border: 1px solid var(--kumo-warning);
  color: oklch(47.6% .114 61.907);
}

.banner-error {
  background-color: var(--kumo-error-surface);
  border: 1px solid var(--kumo-destructive);
  color: oklch(44.4% .177 26.899);
}

.banner svg {
  flex-shrink: 0;
}

.banner p {
  margin: 0;
  flex: 1;
}

/* Link Button */
.link-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  background-color: var(--kumo-primary);
  color: var(--kumo-primary-foreground);
  text-decoration: none;
  border-radius: var(--radius-lg);
  font-weight: 500;
  font-size: 14px;
  transition: background-color 0.1s ease;
}

.link-btn:hover {
  background-color: oklch(48.8% .243 264.376);
}

.link-btn svg {
  width: 16px;
  height: 16px;
}

/* Success Card */
.success-card {
  background: var(--kumo-surface);
  border: 1px solid var(--kumo-border);
  border-radius: var(--radius-lg);
  padding: 24px;
  margin-top: 20px;
}

.success-card h3 {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 16px 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.success-card h3 svg {
  color: var(--kumo-success);
}

.success-card-section {
  margin-bottom: 16px;
}

.success-card-section:last-child {
  margin-bottom: 0;
}

.success-card-label {
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--kumo-muted-foreground);
  margin-bottom: 8px;
}

.success-card-urls {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.url-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.url-text {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  color: var(--kumo-surface-foreground);
}

/* Status Badges */
.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 500;
  text-transform: capitalize;
}

.status-active {
  background-color: var(--kumo-success-surface);
  color: oklch(45% .18 149.214);
}

.status-pending {
  background-color: var(--kumo-warning-surface);
  color: oklch(47.6% .114 61.907);
}

.status-error {
  background-color: var(--kumo-error-surface);
  color: oklch(44.4% .177 26.899);
}

/* Error Details */
.error-details {
  margin-top: 8px;
  padding: 10px 12px;
  background-color: var(--kumo-error-surface);
  border-radius: var(--radius-md);
  font-size: 12px;
  max-width: 300px;
  word-wrap: break-word;
  white-space: normal;
}

.error-item {
  color: oklch(44.4% .177 26.899);
  margin-bottom: 6px;
  line-height: 1.4;
}

.error-item:last-child {
  margin-bottom: 0;
}

/* SSL/Hostname Status Details - warning variant */
.status-details {
  margin-top: 8px;
  padding: 10px 12px;
  background-color: var(--kumo-warning-surface);
  border-radius: var(--radius-md);
  font-size: 12px;
  max-width: 300px;
  word-wrap: break-word;
  white-space: normal;
}

.status-details.error {
  background-color: var(--kumo-error-surface);
}

.status-details-item {
  color: oklch(47.6% .114 61.907);
  margin-bottom: 6px;
  line-height: 1.4;
}

.status-details.error .status-details-item {
  color: oklch(44.4% .177 26.899);
}

.status-details-item:last-child {
  margin-bottom: 0;
}

/* Status cell container */
.status-cell {
  min-width: 120px;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Table Links */
.table-link {
  color: var(--kumo-primary);
  text-decoration: none;
}

.table-link:hover {
  text-decoration: underline;
}

/* Animations */
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.animate-spin {
  animation: spin 1s linear infinite;
}

.response-success {
  background-color: var(--kumo-success-surface);
  color: var(--kumo-surface-foreground);
  padding: 16px 20px;
  border: 1px solid var(--kumo-success);
  border-radius: var(--radius-lg);
  margin-top: 20px;
}

.response-error {
  background-color: var(--kumo-error-surface);
  color: var(--kumo-surface-foreground);
  padding: 16px 20px;
  border: 1px solid var(--kumo-destructive);
  border-radius: var(--radius-lg);
  margin-top: 20px;
}

.response-success h3, .response-error h3 {
  margin-top: 0;
  margin-bottom: 8px;
  font-weight: 600;
  font-size: 16px;
}

.response-success p, .response-error p {
  margin: 8px 0;
  font-size: 14px;
}

.response-success a {
  color: var(--kumo-primary);
  text-decoration: underline;
  font-weight: 500;
}

.status-check {
  background-color: var(--kumo-info-surface);
  color: var(--kumo-surface-foreground);
  padding: 16px;
  border: 1px solid var(--kumo-info);
  border-radius: var(--radius-lg);
  margin-top: 16px;
}

.status-check.active {
  background-color: var(--kumo-success-surface);
  border-color: var(--kumo-success);
}

.status-check.pending {
  background-color: var(--kumo-warning-surface);
  border-color: var(--kumo-warning);
}

.status-check.error {
  background-color: var(--kumo-error-surface);
  border-color: var(--kumo-destructive);
}

.status-check strong {
  font-weight: 600;
}

.status-check .status-details {
  margin-top: 12px;
  font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  color: var(--kumo-muted-foreground);
}

.status-check .btn {
  font-size: 13px;
  padding: 8px 12px;
}

.status-check p {
  margin: 8px 0;
}

.response-success .btn,
.response-error .btn {
  margin-top: 12px;
}

/* Deploy progress */
.deploy-progress {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 24px;
  background: var(--kumo-surface);
  border: 1px solid var(--kumo-border);
  border-radius: var(--radius-lg);
  margin-top: 20px;
  text-align: center;
}

.deploy-progress-icon {
  color: var(--kumo-primary);
  margin-bottom: 16px;
}

.deploy-progress-icon svg {
  width: 32px;
  height: 32px;
}

.deploy-progress-text {
  font-size: 15px;
  font-weight: 500;
  color: var(--kumo-surface-foreground);
  margin-bottom: 4px;
}

.deploy-progress-details {
  font-size: 13px;
  color: var(--kumo-muted-foreground);
}

/* Meter/Progress bar component */
.meter {
  width: 100%;
  max-width: 300px;
  height: 8px;
  background: var(--kumo-accent);
  border-radius: 4px;
  overflow: hidden;
  margin: 12px 0;
}

.meter-fill {
  height: 100%;
  background: var(--kumo-primary);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.meter-label {
  font-size: 12px;
  color: var(--kumo-muted-foreground);
  margin-top: 4px;
}

/* Tab switcher */
.tab-switcher {
  display: flex;
  gap: 0;
  margin-bottom: 12px;
  border: 1px solid var(--kumo-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  width: fit-content;
}

.tab-btn {
  padding: 8px 16px;
  background: var(--kumo-surface);
  border: none;
  font-size: 13px;
  font-weight: 500;
  color: var(--kumo-muted-foreground);
  cursor: pointer;
  transition: background-color 0.1s ease, color 0.1s ease;
}

.tab-btn:not(:last-child) {
  border-right: 1px solid var(--kumo-border);
}

.tab-btn:hover {
  background: var(--kumo-surface-active);
}

.tab-btn.active {
  background: var(--kumo-primary);
  color: var(--kumo-primary-foreground);
}

.tab-content {
  display: none;
}

.tab-content.active {
  display: block;
}

/* Drop zone */
.drop-zone {
  border: 2px dashed var(--kumo-border);
  border-radius: var(--radius-lg);
  padding: 40px 24px;
  text-align: center;
  background: var(--kumo-surface);
  transition: border-color 0.2s ease, background-color 0.2s ease;
  cursor: pointer;
}

.drop-zone:hover {
  border-color: var(--kumo-border-hover);
  background: var(--kumo-surface-active);
}

.drop-zone.drag-over {
  border-color: var(--kumo-primary);
  background: var(--kumo-info-surface);
}

.drop-zone-icon {
  width: 48px;
  height: 48px;
  margin: 0 auto 16px;
  color: var(--kumo-muted-foreground);
}

.drop-zone-text {
  font-size: 14px;
  color: var(--kumo-surface-foreground);
  margin-bottom: 4px;
}

.drop-zone-hint {
  font-size: 12px;
  color: var(--kumo-muted-foreground);
}

.drop-zone-hint a {
  color: var(--kumo-primary);
  cursor: pointer;
}

.drop-zone-hint a:hover {
  text-decoration: underline;
}

/* File list */
.file-list {
  margin-top: 16px;
  border: 1px solid var(--kumo-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.file-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: var(--kumo-accent);
  border-bottom: 1px solid var(--kumo-border);
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--kumo-muted-foreground);
}

.file-list-items {
  max-height: 200px;
  overflow-y: auto;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--kumo-border);
  font-size: 13px;
}

.file-item:last-child {
  border-bottom: none;
}

.file-item-icon {
  width: 20px;
  height: 20px;
  color: var(--kumo-muted-foreground);
  flex-shrink: 0;
}

.file-item-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.file-item-size {
  color: var(--kumo-muted-foreground);
  font-size: 12px;
  flex-shrink: 0;
}

.file-item-remove {
  padding: 4px;
  background: none;
  border: none;
  color: var(--kumo-muted-foreground);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: background-color 0.1s ease, color 0.1s ease;
}

.file-item-remove:hover {
  background: var(--kumo-error-surface);
  color: var(--kumo-destructive);
}

.file-list-empty {
  padding: 24px;
  text-align: center;
  color: var(--kumo-muted-foreground);
  font-size: 13px;
}

/* Size warning */
.size-warning {
  margin-top: 12px;
  padding: 10px 12px;
  background: var(--kumo-warning-surface);
  border: 1px solid var(--kumo-warning);
  border-radius: var(--radius-md);
  font-size: 13px;
  color: oklch(47.6% .114 61.907);
  display: flex;
  align-items: center;
  gap: 8px;
}

.size-warning svg {
  flex-shrink: 0;
}

/* Upload summary */
.upload-summary {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: var(--kumo-surface);
  border: 1px solid var(--kumo-border);
  border-radius: var(--radius-md);
}

.upload-summary-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--kumo-info-surface);
  border-radius: var(--radius-md);
  color: var(--kumo-primary);
}

.upload-summary-info {
  flex: 1;
}

.upload-summary-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--kumo-surface-foreground);
}

.upload-summary-size {
  font-size: 13px;
  color: var(--kumo-muted-foreground);
  margin-top: 2px;
}

.upload-summary-actions {
  display: flex;
  gap: 8px;
}
`;

export const renderPage = (
	body: string,
	options?: { customDomain?: string },
) => `
<!DOCTYPE html><html>
<head>
  <title>Build a Website</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🚀</text></svg>">
  <style>${CSS}</style>
</head>
<body>
<div class="header">
  <h1>Build a Website</h1>
  <p>Create and deploy your website instantly</p>
</div>
${body}
<script>
  window.CUSTOM_DOMAIN = '${options?.customDomain || ""}';
</script>
</body>
</html>
`;

export const BuildWebsitePage = `
<div class="form-container">
  <form id="projectForm">
    <div class="form-group">
      <label for="projectName">Website Name</label>
      <input type="text" id="projectName" required placeholder="My Awesome Site" oninput="document.getElementById('subdomain').value = this.value.toLowerCase().replace(/[^a-z0-9\\s-]/g, '').replace(/\\s+/g, '-').replace(/^-+|-+$/g, '')">
    </div>
    
    <div class="form-group">
      <label for="subdomain">Your URL</label>
      <div id="urlPreview" style="display: flex; align-items: center; gap: 8px;">
        <input type="text" id="subdomain" required placeholder="my-awesome-site" pattern="[a-z0-9-]+" title="Only lowercase letters, numbers, and hyphens" style="flex: 1;">
        <span id="domainSuffix" style="font-size: 14px; font-weight: 500; color: var(--kumo-muted-foreground);"></span>
      </div>
      <small>This will be your website's address</small>
    </div>
    
    <div class="form-group">
      <label for="customHostname">Custom domain <span style="font-weight: 400; color: var(--kumo-muted-foreground);">(optional)</span></label>
      <input type="text" id="customHostname" placeholder="mystore.com">
      <small>Connect your own domain to display your site at your own URL.</small>
      <div id="dnsInstructions" style="display: none; margin-top: 12px;">
        <div class="banner banner-warning">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256"><path d="M236.8,188.09,149.35,36.22h0a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09ZM222.93,203.8a8.5,8.5,0,0,1-7.48,4.2H40.55a8.5,8.5,0,0,1-7.48-4.2,7.59,7.59,0,0,1,0-7.72L120.52,44.21a8.75,8.75,0,0,1,15,0l87.45,151.87A7.59,7.59,0,0,1,222.93,203.8ZM120,144V104a8,8,0,0,1,16,0v40a8,8,0,0,1-16,0Zm20,36a12,12,0,1,1-12-12A12,12,0,0,1,140,180Z"/></svg>
          <p>Add this CNAME record to your domain's DNS settings</p>
        </div>
        <table class="dns-table" style="margin-top: 12px;">
          <thead>
            <tr>
              <th>Type</th>
              <th>Name</th>
              <th>Target</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>CNAME</td>
              <td>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span id="customDomainName"></span>
                  <button type="button" class="btn-icon" onclick="copyToClipboard(document.getElementById('customDomainName').textContent, this)" title="Copy name">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M216,32H88a8,8,0,0,0-8,8V80H40a8,8,0,0,0-8,8V216a8,8,0,0,0,8,8H168a8,8,0,0,0,8-8V176h40a8,8,0,0,0,8-8V40A8,8,0,0,0,216,32ZM160,208H48V96H160Zm48-48H176V88a8,8,0,0,0-8-8H96V48H208Z"/></svg>
                  </button>
                </div>
              </td>
              <td>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span id="cnameTarget"></span>
                  <button type="button" class="btn-icon" onclick="copyToClipboard(document.getElementById('cnameTarget').textContent, this)" title="Copy target">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M216,32H88a8,8,0,0,0-8,8V80H40a8,8,0,0,0-8,8V216a8,8,0,0,0,8,8H168a8,8,0,0,0,8-8V176h40a8,8,0,0,0,8-8V40A8,8,0,0,0,216,32ZM160,208H48V96H160Zm48-48H176V88a8,8,0,0,0-8-8H96V48H208Z"/></svg>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    
    <div class="form-group">
      <label>Website Content</label>
      <div class="tab-switcher">
        <button type="button" class="tab-btn active" onclick="switchTab('code')">Write Code</button>
        <button type="button" class="tab-btn" onclick="switchTab('upload')">Upload Files</button>
      </div>
      
      <div id="tab-code" class="tab-content active">
        <button type="button" class="collapsible-trigger open" onclick="toggleCodeEditor()" id="codeEditorToggle">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256"><path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"/></svg>
          <span>Hide Code Editor</span>
        </button>
        <div id="codeEditorContent" class="collapsible-content open">
          <textarea id="scriptContent" name="scriptContent" rows="18">
export default {
  async fetch(request, env, ctx) {
    const html = \`
<!DOCTYPE html>
<html>
<head>
  <title>My Website</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: ui-sans-serif, system-ui, sans-serif;
      max-width: 800px; 
      margin: 0 auto; 
      padding: 48px 24px;
      background: #fafafa;
      color: #000;
      line-height: 1.5;
    }
    h1 { 
      color: #056dff; 
      font-size: 2rem;
      font-weight: 600;
      margin-bottom: 16px;
      letter-spacing: -0.01em;
    }
    p { 
      font-size: 15px; 
      line-height: 1.6;
      margin-bottom: 12px;
      color: #444;
    }
    .container {
      background: #fff;
      padding: 32px;
      border-radius: 8px;
      border: 1px solid #e5e5e5;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Welcome to My Website</h1>
    <p>This is my new website built with Cloudflare Workers.</p>
    <p>You can customize this code to build anything you want!</p>
  </div>
</body>
</html>
    \`;
    
    return new Response(html, {
      headers: { 'Content-Type': 'text/html' }
    });
  }
};
          </textarea>
        </div>
      </div>
      
      <div id="tab-upload" class="tab-content">
        <div class="drop-zone" id="dropZone">
          <svg class="drop-zone-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <div class="drop-zone-text">Drop files or folder here</div>
          <div class="drop-zone-hint">
            Or <a href="#" id="browseFiles">select files</a> / <a href="#" id="browseFolder">select folder</a>
          </div>
          <div class="drop-zone-hint" style="margin-top: 8px;">Supports HTML, CSS, JS, images (PNG, JPG, SVG, GIF, ICO)</div>
        </div>
        <input type="file" id="fileInput" multiple style="display: none;">
        <input type="file" id="folderInput" webkitdirectory style="display: none;">
        
        <!-- Upload summary shown after files are added -->
        <div class="upload-summary" id="uploadSummary" style="display: none;">
          <div class="upload-summary-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 256 256"><path d="M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Zm-40-64a8,8,0,0,1-8,8H136v16a8,8,0,0,1-16,0V160H104a8,8,0,0,1,0-16h16V128a8,8,0,0,1,16,0v16h16A8,8,0,0,1,160,152Z"/></svg>
          </div>
          <div class="upload-summary-info">
            <div class="upload-summary-title"><span id="summaryFileCount">0</span> files ready</div>
            <div class="upload-summary-size"><span id="summaryTotalSize">0 KB</span></div>
          </div>
          <div class="upload-summary-actions">
            <button type="button" class="btn btn-sm btn-secondary" onclick="showFileDetails()">View Files</button>
            <button type="button" class="btn btn-sm btn-secondary" onclick="clearAllFiles()">Clear</button>
          </div>
        </div>
        
        <div class="file-list" id="fileList" style="display: none;">
          <div class="file-list-header">
            <span>Uploaded Files</span>
            <button type="button" class="btn-icon" onclick="hideFileDetails()" title="Collapse">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 256 256"><path d="M213.66,165.66a8,8,0,0,1-11.32,0L128,91.31,53.66,165.66a8,8,0,0,1-11.32-11.32l80-80a8,8,0,0,1,11.32,0l80,80A8,8,0,0,1,213.66,165.66Z"/></svg>
            </button>
          </div>
          <div class="file-list-items" id="fileListItems"></div>
        </div>
        
        <div id="sizeWarning" class="size-warning" style="display: none;">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256"><path d="M236.8,188.09,149.35,36.22h0a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09ZM222.93,203.8a8.5,8.5,0,0,1-7.48,4.2H40.55a8.5,8.5,0,0,1-7.48-4.2,7.59,7.59,0,0,1,0-7.72L120.52,44.21a8.75,8.75,0,0,1,15,0l87.45,151.87A7.59,7.59,0,0,1,222.93,203.8Z"/></svg>
          <span>Total size: <strong id="totalSize">0 KB</strong>. Large files may slow down your site. Consider optimizing images.</span>
        </div>
      </div>
    </div>
    
    <button type="submit" class="btn btn-primary btn-lg" style="width: 100%;">Create & Deploy Website</button>
  </form>

  <div id="projectResponse"></div>
</div>

<script>
// Global state for uploaded files
window.uploadedFiles = [];
window.activeTab = 'code';

// Tab switching
function switchTab(tab) {
  window.activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach(function(btn) { btn.classList.remove('active'); });
  document.querySelectorAll('.tab-content').forEach(function(content) { content.classList.remove('active'); });
  document.querySelector('.tab-btn[onclick="switchTab(\\'' + tab + '\\')"]').classList.add('active');
  document.getElementById('tab-' + tab).classList.add('active');
}

// File type helpers
function getFileIcon(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const icons = {
    html: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256"><path d="M128,24a104,104,0,1,0,104,104A104.11,104.11,0,0,0,128,24Zm0,16a87.87,87.87,0,0,1,69.72,34.17L175.4,93.89,127.75,66.21a8,8,0,0,0-8.12.09L78.69,93.79l-22-19.08A87.89,87.89,0,0,1,128,40ZM48,135.48,75.78,111.9a8,8,0,0,0,2.82-6.74,8,8,0,0,0-1.06-3.47L58.48,68.77A88.05,88.05,0,0,1,48,128C48,130.51,48.07,133,48,135.48Zm80,80.38a87.85,87.85,0,0,1-61.22-24.87l8.83-43.7a8,8,0,0,0-1.29-6.18L48,102.48V128a88.15,88.15,0,0,1-1.92,18.39L83.79,175.8a8,8,0,0,0,6.71,2.1l37.5-5Z"/></svg>',
    css: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256"><path d="M200,168a32,32,0,0,1-32,32H136v16a8,8,0,0,1-16,0V56H96a8,8,0,0,1,0-16h80a32,32,0,0,1,0,64H136V184h32A16,16,0,0,0,184,168a8,8,0,0,1,16,0Zm-64-72h40a16,16,0,0,0,0-32H136Z"/></svg>',
    js: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256"><path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,160H40V56H216V200ZM120,152a8,8,0,0,1-8,8H96v8a8,8,0,0,1-16,0V120a8,8,0,0,1,8-8h24a8,8,0,0,1,0,16H96v16h16A8,8,0,0,1,120,152Zm64-24a8,8,0,0,1-8,8H160v32a8,8,0,0,1-16,0V136h-8a8,8,0,0,1,0-16h32A8,8,0,0,1,184,128Z"/></svg>',
  };
  const imageIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256"><path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,160H40V56H216V200ZM160,84a12,12,0,1,1-12-12A12,12,0,0,1,160,84Zm40,68v40H56V160l36-36a4,4,0,0,1,5.66,0L133,159.34a8,8,0,0,0,11.32,0L176,128a4,4,0,0,1,5.66,0Z"/></svg>';
  const defaultIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256"><path d="M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Z"/></svg>';
  
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp'].includes(ext)) return imageIcon;
  return icons[ext] || defaultIcon;
}

function getMimeType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const mimes = {
    'html': 'text/html', 'htm': 'text/html',
    'css': 'text/css',
    'js': 'application/javascript',
    'json': 'application/json',
    'txt': 'text/plain',
    'svg': 'image/svg+xml',
    'png': 'image/png',
    'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'ico': 'image/x-icon',
    'webp': 'image/webp',
  };
  return mimes[ext] || 'application/octet-stream';
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// Code editor toggle
function toggleCodeEditor() {
  var toggle = document.getElementById('codeEditorToggle');
  var content = document.getElementById('codeEditorContent');
  toggle.classList.toggle('open');
  content.classList.toggle('open');
  // Update button text
  var span = toggle.querySelector('span');
  if (toggle.classList.contains('open')) {
    span.textContent = 'Hide Code Editor';
  } else {
    span.textContent = 'Show Code Editor';
  }
}

// File details toggle
function showFileDetails() {
  document.getElementById('fileList').style.display = 'block';
}

function hideFileDetails() {
  document.getElementById('fileList').style.display = 'none';
}

// File handling
function updateFileList() {
  var fileList = document.getElementById('fileList');
  var fileListItems = document.getElementById('fileListItems');
  var sizeWarning = document.getElementById('sizeWarning');
  var dropZone = document.getElementById('dropZone');
  var uploadSummary = document.getElementById('uploadSummary');
  
  if (window.uploadedFiles.length === 0) {
    fileList.style.display = 'none';
    sizeWarning.style.display = 'none';
    dropZone.style.display = 'block';
    uploadSummary.style.display = 'none';
    return;
  }
  
  // Calculate total size
  var totalSize = 0;
  for (var j = 0; j < window.uploadedFiles.length; j++) {
    totalSize += window.uploadedFiles[j].size;
  }
  
  // Hide drop zone, show summary
  dropZone.style.display = 'none';
  uploadSummary.style.display = 'flex';
  document.getElementById('summaryFileCount').textContent = window.uploadedFiles.length;
  document.getElementById('summaryTotalSize').textContent = formatFileSize(totalSize);
  
  // Build file list (hidden by default, shown when "View Files" clicked)
  var html = '';
  for (var i = 0; i < window.uploadedFiles.length; i++) {
    var file = window.uploadedFiles[i];
    html += '<div class="file-item">';
    html += '<span class="file-item-icon">' + getFileIcon(file.name) + '</span>';
    html += '<span class="file-item-name" title="' + file.name + '">' + file.name + '</span>';
    html += '<span class="file-item-size">' + formatFileSize(file.size) + '</span>';
    html += '<button type="button" class="file-item-remove" onclick="removeFile(' + i + ')" title="Remove">';
    html += '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 256 256"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>';
    html += '</button>';
    html += '</div>';
  }
  fileListItems.innerHTML = html;
  
  // Hide file list by default (user can click "View Files" to see it)
  fileList.style.display = 'none';
  
  var warningEl = document.getElementById('sizeWarning');
  
  if (totalSize > 1024 * 1024) { // > 1MB - show size info
    warningEl.className = 'size-warning';
    warningEl.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm-8-80V80a8,8,0,0,1,16,0v56a8,8,0,0,1-16,0Zm20,36a12,12,0,1,1-12-12A12,12,0,0,1,140,172Z"/></svg><span>Total size: <strong>' + formatFileSize(totalSize) + '</strong>. Large sites may take longer to deploy.</span>';
    warningEl.style.display = 'flex';
  } else {
    warningEl.style.display = 'none';
  }
}

function removeFile(index) {
  window.uploadedFiles.splice(index, 1);
  updateFileList();
}

function clearAllFiles() {
  window.uploadedFiles = [];
  updateFileList();
}

async function handleFiles(files) {
  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    if (!isAllowedFile(file.name)) continue;
    
    // Check if file already exists and remove it
    var newList = [];
    for (var j = 0; j < window.uploadedFiles.length; j++) {
      if (window.uploadedFiles[j].name !== file.name) {
        newList.push(window.uploadedFiles[j]);
      }
    }
    window.uploadedFiles = newList;
    
    var content = await readFileContent(file);
    window.uploadedFiles.push({
      name: file.name,
      size: file.size,
      type: getMimeType(file.name),
      content: content,
      isBase64: isBinaryFile(file.name)
    });
  }
  updateFileList();
}

async function handleFilesWithPaths(fileEntries) {
  for (var i = 0; i < fileEntries.length; i++) {
    var entry = fileEntries[i];
    var file = entry.file;
    var path = entry.path;
    
    // Check if file already exists and remove it
    var newList = [];
    for (var j = 0; j < window.uploadedFiles.length; j++) {
      if (window.uploadedFiles[j].name !== path) {
        newList.push(window.uploadedFiles[j]);
      }
    }
    window.uploadedFiles = newList;
    
    var content = await readFileContent(file);
    window.uploadedFiles.push({
      name: path,
      size: file.size,
      type: getMimeType(path),
      content: content,
      isBase64: isBinaryFile(path)
    });
  }
  updateFileList();
}

function isBinaryFile(filename) {
  var ext = filename.split('.').pop().toLowerCase();
  var binaryExts = ['png', 'jpg', 'jpeg', 'gif', 'ico', 'webp', 'woff', 'woff2', 'ttf', 'eot'];
  return binaryExts.indexOf(ext) !== -1;
}

function isAllowedFile(filename) {
  var ext = filename.split('.').pop().toLowerCase();
  var allowed = ['html', 'htm', 'css', 'js', 'json', 'txt', 'svg', 'png', 'jpg', 'jpeg', 'gif', 'ico', 'webp', 'woff', 'woff2', 'ttf', 'eot'];
  return allowed.indexOf(ext) !== -1;
}

function readFileContent(file) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload = function() {
      // Always use base64 for the assets API
      resolve(reader.result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Generate worker code from uploaded files
function generateWorkerCode() {
  if (window.uploadedFiles.length === 0) return null;
  
  // Build assets object using JSON for safety
  var assets = {};
  for (var i = 0; i < window.uploadedFiles.length; i++) {
    var file = window.uploadedFiles[i];
    var path = '/' + file.name;
    assets[path] = {
      type: file.type,
      content: file.content,
      isBase64: file.isBase64 || false
    };
  }
  
  var assetsJson = JSON.stringify(assets, null, 2);
  
  var workerCode = '// Auto-generated static site worker\\n';
  workerCode += 'const ASSETS = ' + assetsJson + ';\\n\\n';
  workerCode += '// Helper to decode base64\\n';
  workerCode += 'function base64ToArrayBuffer(base64) {\\n';
  workerCode += '  const binaryString = atob(base64);\\n';
  workerCode += '  const bytes = new Uint8Array(binaryString.length);\\n';
  workerCode += '  for (let i = 0; i < binaryString.length; i++) {\\n';
  workerCode += '    bytes[i] = binaryString.charCodeAt(i);\\n';
  workerCode += '  }\\n';
  workerCode += '  return bytes;\\n';
  workerCode += '}\\n\\n';
  workerCode += 'export default {\\n';
  workerCode += '  async fetch(request, env, ctx) {\\n';
  workerCode += '    const url = new URL(request.url);\\n';
  workerCode += '    let path = url.pathname;\\n';
  workerCode += '    \\n';
  workerCode += '    // Default to index.html\\n';
  workerCode += '    if (path === "/" || path === "") {\\n';
  workerCode += '      path = "/index.html";\\n';
  workerCode += '    }\\n';
  workerCode += '    \\n';
  workerCode += '    // Try to find the asset\\n';
  workerCode += '    const asset = ASSETS[path];\\n';
  workerCode += '    if (asset) {\\n';
  workerCode += '      const headers = { "Content-Type": asset.type };\\n';
  workerCode += '      if (asset.isBase64) {\\n';
  workerCode += '        return new Response(base64ToArrayBuffer(asset.content), { headers });\\n';
  workerCode += '      }\\n';
  workerCode += '      return new Response(asset.content, { headers });\\n';
  workerCode += '    }\\n';
  workerCode += '    \\n';
  workerCode += '    // 404 - try index.html for SPA routing\\n';
  workerCode += '    if (ASSETS["/index.html"]) {\\n';
  workerCode += '      return new Response(ASSETS["/index.html"].content, {\\n';
  workerCode += '        headers: { "Content-Type": "text/html" }\\n';
  workerCode += '      });\\n';
  workerCode += '    }\\n';
  workerCode += '    \\n';
  workerCode += '    return new Response("Not Found", { status: 404 });\\n';
  workerCode += '  }\\n';
  workerCode += '};\\n';
  
  return workerCode;
}

// Get all files from a dropped folder recursively
async function getFilesFromDataTransfer(dataTransfer) {
  var files = [];
  var items = dataTransfer.items;
  
  if (items) {
    var entries = [];
    for (var i = 0; i < items.length; i++) {
      var entry = items[i].webkitGetAsEntry ? items[i].webkitGetAsEntry() : null;
      if (entry) {
        entries.push(entry);
      }
    }
    
    // If single directory is dropped, don't include its name in paths
    var isSingleFolder = entries.length === 1 && entries[0].isDirectory;
    
    for (var j = 0; j < entries.length; j++) {
      var entry = entries[j];
      if (isSingleFolder && entry.isDirectory) {
        // Read contents of the folder directly without the folder name prefix
        var entryFiles = await readDirectoryContents(entry, '');
        files = files.concat(entryFiles);
      } else {
        var entryFiles = await readEntry(entry, '');
        files = files.concat(entryFiles);
      }
    }
  }
  
  // Fallback to regular files if no entries
  if (files.length === 0 && dataTransfer.files.length > 0) {
    for (var k = 0; k < dataTransfer.files.length; k++) {
      files.push({ file: dataTransfer.files[k], path: dataTransfer.files[k].name });
    }
  }
  
  return files;
}

// Read directory contents without including the directory name
function readDirectoryContents(dirEntry, basePath) {
  return new Promise(function(resolve) {
    var reader = dirEntry.createReader();
    reader.readEntries(function(entries) {
      var promises = [];
      for (var i = 0; i < entries.length; i++) {
        promises.push(readEntry(entries[i], basePath));
      }
      Promise.all(promises).then(function(results) {
        var files = [];
        for (var j = 0; j < results.length; j++) {
          files = files.concat(results[j]);
        }
        resolve(files);
      });
    }, function() {
      resolve([]);
    });
  });
}

// Read a file system entry (file or directory)
function readEntry(entry, path) {
  return new Promise(function(resolve) {
    if (entry.isFile) {
      entry.file(function(file) {
        var filePath = path ? path + '/' + file.name : file.name;
        resolve([{ file: file, path: filePath }]);
      }, function() {
        resolve([]);
      });
    } else if (entry.isDirectory) {
      var reader = entry.createReader();
      reader.readEntries(function(entries) {
        var promises = [];
        var dirPath = path ? path + '/' + entry.name : entry.name;
        for (var i = 0; i < entries.length; i++) {
          promises.push(readEntry(entries[i], dirPath));
        }
        Promise.all(promises).then(function(results) {
          var files = [];
          for (var j = 0; j < results.length; j++) {
            files = files.concat(results[j]);
          }
          resolve(files);
        });
      }, function() {
        resolve([]);
      });
    } else {
      resolve([]);
    }
  });
}

// Set up event listeners when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  
  // Set dynamic domain values
  const customDomain = window.CUSTOM_DOMAIN;
  const domainSuffix = document.getElementById('domainSuffix');
  const cnameTarget = document.getElementById('cnameTarget');
  
  if (domainSuffix) {
    domainSuffix.textContent = customDomain ? '.' + customDomain : '.workers.dev';
  }
  if (cnameTarget) {
    cnameTarget.textContent = customDomain ? 'my.' + customDomain : '(requires custom domain)';
  }

  // Drag and drop handling
  var dropZone = document.getElementById('dropZone');
  var fileInput = document.getElementById('fileInput');
  var folderInput = document.getElementById('folderInput');
  var browseFiles = document.getElementById('browseFiles');
  var browseFolder = document.getElementById('browseFolder');
  
  if (browseFiles) {
    browseFiles.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      fileInput.click();
    });
  }
  
  if (browseFolder) {
    browseFolder.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      folderInput.click();
    });
  }
  
  if (dropZone) {
    dropZone.addEventListener('dragover', function(e) {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
    
    dropZone.addEventListener('dragleave', function(e) {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
    });
    
    dropZone.addEventListener('drop', async function(e) {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      
      var fileEntries = await getFilesFromDataTransfer(e.dataTransfer);
      var filesToProcess = [];
      for (var i = 0; i < fileEntries.length; i++) {
        if (isAllowedFile(fileEntries[i].path)) {
          filesToProcess.push({ file: fileEntries[i].file, path: fileEntries[i].path });
        }
      }
      
      if (filesToProcess.length > 0) {
        await handleFilesWithPaths(filesToProcess);
      }
    });
  }
  
  if (fileInput) {
    fileInput.addEventListener('change', function(e) {
      handleFiles(e.target.files);
      e.target.value = '';
    });
  }
  
  if (folderInput) {
    folderInput.addEventListener('change', function(e) {
      var files = e.target.files;
      var filesToProcess = [];
      for (var i = 0; i < files.length; i++) {
        var file = files[i];
        // webkitRelativePath contains the folder structure
        var path = file.webkitRelativePath || file.name;
        // Remove the root folder name from the path
        var parts = path.split('/');
        if (parts.length > 1) {
          parts.shift(); // Remove root folder
          path = parts.join('/');
        }
        if (isAllowedFile(path)) {
          filesToProcess.push({ file: file, path: path });
        }
      }
      if (filesToProcess.length > 0) {
        handleFilesWithPaths(filesToProcess);
      }
      e.target.value = '';
    });
  }

  // DNS instructions
  const customHostnameInput = document.getElementById('customHostname');
  if (customHostnameInput) {
    customHostnameInput.addEventListener('input', function(e) {
      const customHostname = e.target.value;
      const dnsInstructions = document.getElementById('dnsInstructions');
      const customDomainName = document.getElementById('customDomainName');
      
      if (customHostname) {
        customDomainName.textContent = customHostname;
        dnsInstructions.style.display = 'block';
      } else {
        dnsInstructions.style.display = 'none';
      }
    });
  }

  // Form submission
  const projectForm = document.getElementById('projectForm');
  if (projectForm) {
    projectForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const projectName = document.getElementById('projectName').value;
      const subdomain = document.getElementById('subdomain').value;
      const customHostname = document.getElementById('customHostname').value;
      
      // Get script content or assets based on active tab
      var scriptContent = null;
      var assets = null;
      
      if (window.activeTab === 'upload' && window.uploadedFiles.length > 0) {
        // Send assets array for static site deployment
        assets = [];
        for (var i = 0; i < window.uploadedFiles.length; i++) {
          var file = window.uploadedFiles[i];
          assets.push({
            path: file.name,
            content: file.content,  // Already base64 encoded
            size: file.size
          });
        }
        
        // Validate: Check for index.html
        var hasIndexHtml = assets.some(function(a) {
          var p = a.path.toLowerCase();
          return p === 'index.html' || p.endsWith('/index.html');
        });
        
        if (!hasIndexHtml) {
          var fileList = assets.slice(0, 15).map(function(a) { return a.path; }).join('\\n');
          if (assets.length > 15) fileList += '\\n... and ' + (assets.length - 15) + ' more files';
          
          alert('No index.html found in uploaded files.\\n\\nYour site needs an index.html file at the root level.\\n\\nFiles detected:\\n' + fileList + '\\n\\nTip: Make sure you\\'re uploading the build output folder (e.g., dist/ or build/), not the source folder.');
          return;
        }
        
        // Validate: Check that we have actual content
        var hasContent = assets.some(function(a) { return a.content && a.content.length > 0; });
        if (!hasContent) {
          alert('Files appear to be empty. Please try uploading again.');
          return;
        }
        
        // Validate: Check index.html has content
        var indexFile = assets.find(function(a) {
          var p = a.path.toLowerCase();
          return p === 'index.html' || p.endsWith('/index.html');
        });
        if (indexFile && (!indexFile.content || indexFile.content.length < 10)) {
          alert('index.html appears to be empty. Please check your build output.');
          return;
        }
        
      } else if (window.activeTab === 'upload') {
        alert('Please upload files first');
        return;
      } else {
        scriptContent = document.getElementById('scriptContent').value;
        if (!scriptContent) {
          alert('Please enter website code or upload files');
          return;
        }
      }
      
      const responseDiv = document.getElementById('projectResponse');
      const submitButton = document.querySelector('button[type="submit"]');
      
      // Show loading state with progress
      var fileCount = window.uploadedFiles ? window.uploadedFiles.length : 0;
      var totalSize = 0;
      if (window.uploadedFiles) {
        for (var i = 0; i < window.uploadedFiles.length; i++) {
          totalSize += window.uploadedFiles[i].size;
        }
      }
      
      submitButton.disabled = true;
      submitButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256" class="animate-spin" style="margin-right: 8px;"><path d="M232,128a104,104,0,0,1-208,0c0-41,23.81-78.36,60.66-95.27a8,8,0,0,1,6.68,14.54C60.15,61.59,40,93.27,40,128a88,88,0,0,0,176,0c0-34.73-20.15-66.41-51.34-80.73a8,8,0,0,1,6.68-14.54C208.19,49.64,232,87,232,128Z"/></svg> Preparing...';
      
      // Show progress in response div
      var progressHTML = '<div class="deploy-progress">';
      progressHTML += '<div class="deploy-progress-icon"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 256 256" class="animate-spin"><path d="M232,128a104,104,0,0,1-208,0c0-41,23.81-78.36,60.66-95.27a8,8,0,0,1,6.68,14.54C60.15,61.59,40,93.27,40,128a88,88,0,0,0,176,0c0-34.73-20.15-66.41-51.34-80.73a8,8,0,0,1,6.68-14.54C208.19,49.64,232,87,232,128Z"/></svg></div>';
      progressHTML += '<div class="deploy-progress-text" id="deployStatus">Preparing your website...</div>';
      if (fileCount > 0) {
        progressHTML += '<div class="meter" id="uploadMeter"><div class="meter-fill" id="uploadMeterFill" style="width: 0%"></div></div>';
        progressHTML += '<div class="deploy-progress-details" id="uploadProgress">' + fileCount + ' files (' + formatFileSize(totalSize) + ')</div>';
      }
      progressHTML += '</div>';
      responseDiv.innerHTML = progressHTML;
      
      // Update status helper
      function updateStatus(text, progress) {
        var statusEl = document.getElementById('deployStatus');
        if (statusEl) statusEl.textContent = text;
        submitButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256" class="animate-spin" style="margin-right: 8px;"><path d="M232,128a104,104,0,0,1-208,0c0-41,23.81-78.36,60.66-95.27a8,8,0,0,1,6.68,14.54C60.15,61.59,40,93.27,40,128a88,88,0,0,0,176,0c0-34.73-20.15-66.41-51.34-80.73a8,8,0,0,1,6.68-14.54C208.19,49.64,232,87,232,128Z"/></svg> ' + text;
        if (typeof progress === 'number') {
          var meterFill = document.getElementById('uploadMeterFill');
          var progressEl = document.getElementById('uploadProgress');
          if (meterFill) meterFill.style.width = progress + '%';
          if (progressEl) progressEl.textContent = Math.round(progress) + '% complete';
        }
      }
      
      // Simulate progress for large uploads
      var progressInterval = null;
      var simulatedProgress = 0;
      if (fileCount > 0) {
        progressInterval = setInterval(function() {
          // Slow down as we approach 90%
          var increment = simulatedProgress < 50 ? 5 : (simulatedProgress < 80 ? 2 : 0.5);
          simulatedProgress = Math.min(90, simulatedProgress + increment);
          updateStatus('Uploading ' + fileCount + ' files...', simulatedProgress);
        }, 500);
      }
      
      try {
        updateStatus('Deploying to edge...', 0);
        
        var requestBody = {
          name: projectName,
          subdomain: subdomain,
          custom_hostname: customHostname || undefined
        };
        
        if (assets) {
          requestBody.assets = assets;
          updateStatus('Uploading ' + assets.length + ' files...', 5);
        } else {
          requestBody.script_content = scriptContent;
        }
        
        const response = await fetch('/projects', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody)
        });
        
        // Stop simulated progress
        if (progressInterval) clearInterval(progressInterval);
        
        const result = await response.text();
        
        if (response.ok) {
          // Show 100% complete
          updateStatus('Complete!', 100);
          const customDomain = window.CUSTOM_DOMAIN;
          const workerUrl = customDomain ? \`https://\${subdomain}.\${customDomain}\` : \`\${window.location.origin}/\${subdomain}\`;
          
          let successHTML = \`
            <div class="success-card">
              <h3>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 256 256"><path d="M173.66,98.34a8,8,0,0,1,0,11.32l-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35A8,8,0,0,1,173.66,98.34ZM232,128A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z"/></svg>
                Website Created
              </h3>
              
              <div class="success-card-section">
                <div class="success-card-label">Your website is live at</div>
                <div class="url-row">
                  <a href="\${workerUrl}" target="_blank" rel="noopener noreferrer" class="link-btn">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256"><path d="M128,24h0A104,104,0,1,0,232,128,104.12,104.12,0,0,0,128,24Zm88,104a87.61,87.61,0,0,1-3.33,24H174.16a157.44,157.44,0,0,0,0-48h38.51A87.61,87.61,0,0,1,216,128ZM102,168H154a115.11,115.11,0,0,1-26,45A115.27,115.27,0,0,1,102,168Zm-3.9-16a140.84,140.84,0,0,1,0-48h59.88a140.84,140.84,0,0,1,0,48ZM40,128a87.61,87.61,0,0,1,3.33-24H81.84a157.44,157.44,0,0,0,0,48H43.33A87.61,87.61,0,0,1,40,128ZM154,88H102a115.11,115.11,0,0,1,26-45A115.27,115.27,0,0,1,154,88Zm52.33,0H170.71a135.28,135.28,0,0,0-22.3-45.6A88.29,88.29,0,0,1,206.37,88ZM107.59,42.4A135.28,135.28,0,0,0,85.29,88H49.63A88.29,88.29,0,0,1,107.59,42.4ZM49.63,168H85.29a135.28,135.28,0,0,0,22.3,45.6A88.29,88.29,0,0,1,49.63,168Zm98.78,45.6a135.28,135.28,0,0,0,22.3-45.6h35.66A88.29,88.29,0,0,1,148.41,213.6Z"/></svg>
                    <span>\${workerUrl.replace('https://', '')}</span>
                  </a>
                </div>
              </div>
          \`;
          
          if (customHostname) {
            successHTML += \`
              <div class="success-card-section" id="domainStatusSection">
                <div class="success-card-label">Custom Domain Status</div>
                <div id="domainStatusBanner"></div>
              </div>
            \`;
          }
          
          successHTML += \`</div>\`;
          
          responseDiv.innerHTML = successHTML;
          
          if (customHostname) {
            checkDomainStatus(subdomain, customHostname, workerUrl);
          }
          // No auto-redirect - user clicks the link to visit their site
          
        } else {
          responseDiv.innerHTML = \`
            <div class="banner banner-error" style="margin-top: 20px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm-8-80V80a8,8,0,0,1,16,0v56a8,8,0,0,1-16,0Zm20,36a12,12,0,1,1-12-12A12,12,0,0,1,140,172Z"/></svg>
              <p>\${result}</p>
            </div>
          \`;
          submitButton.textContent = 'Create & Deploy Website';
          submitButton.disabled = false;
        }
      } catch (error) {
        if (progressInterval) clearInterval(progressInterval);
        responseDiv.innerHTML = \`
          <div class="banner banner-error" style="margin-top: 20px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm-8-80V80a8,8,0,0,1,16,0v56a8,8,0,0,1-16,0Zm20,36a12,12,0,1,1-12-12A12,12,0,0,1,140,172Z"/></svg>
            <p>Failed to create website: \${error.message}</p>
          </div>
        \`;
        submitButton.textContent = 'Create & Deploy Website';
        submitButton.disabled = false;
      }
    });
  }
});

// Copy to clipboard function
function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z"/></svg>';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.classList.remove('copied');
    }, 1500);
  });
}

// Domain status check function
async function checkDomainStatus(subdomain, customHostname, workerUrl) {
  const bannerDiv = document.getElementById('domainStatusBanner');
  if (!bannerDiv) return;
  
  // Store params for refresh
  window._domainParams = { subdomain, customHostname, workerUrl };
  
  bannerDiv.innerHTML = \`
    <div class="banner banner-info">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256" class="animate-spin"><path d="M232,128a104,104,0,0,1-208,0c0-41,23.81-78.36,60.66-95.27a8,8,0,0,1,6.68,14.54C60.15,61.59,40,93.27,40,128a88,88,0,0,0,176,0c0-34.73-20.15-66.41-51.34-80.73a8,8,0,0,1,6.68-14.54C208.19,49.64,232,87,232,128Z"/></svg>
      <p>Checking domain status...</p>
    </div>
  \`;
  
  try {
    const response = await fetch('/projects/' + subdomain + '/custom-domain-status');
    const data = await response.json();
    
    if (!data.has_custom_domain) {
      bannerDiv.innerHTML = \`
        <div class="banner banner-error">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm-8-80V80a8,8,0,0,1,16,0v56a8,8,0,0,1-16,0Zm20,36a12,12,0,1,1-12-12A12,12,0,0,1,140,172Z"/></svg>
          <p>No custom domain configured</p>
        </div>
      \`;
      return;
    }
    
    const isActive = data.is_active;
    const errors = data.verification_errors || [];
    
    if (isActive) {
      bannerDiv.innerHTML = \`
        <div class="banner banner-success" style="margin-bottom: 12px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256"><path d="M173.66,98.34a8,8,0,0,1,0,11.32l-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35A8,8,0,0,1,173.66,98.34ZM232,128A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z"/></svg>
          <p>Custom domain is active</p>
        </div>
        <div class="url-row">
          <a href="https://\${customHostname}" target="_blank" rel="noopener noreferrer" class="link-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256"><path d="M128,24h0A104,104,0,1,0,232,128,104.12,104.12,0,0,0,128,24Zm88,104a87.61,87.61,0,0,1-3.33,24H174.16a157.44,157.44,0,0,0,0-48h38.51A87.61,87.61,0,0,1,216,128ZM102,168H154a115.11,115.11,0,0,1-26,45A115.27,115.27,0,0,1,102,168Zm-3.9-16a140.84,140.84,0,0,1,0-48h59.88a140.84,140.84,0,0,1,0,48ZM40,128a87.61,87.61,0,0,1,3.33-24H81.84a157.44,157.44,0,0,0,0,48H43.33A87.61,87.61,0,0,1,40,128ZM154,88H102a115.11,115.11,0,0,1,26-45A115.27,115.27,0,0,1,154,88Zm52.33,0H170.71a135.28,135.28,0,0,0-22.3-45.6A88.29,88.29,0,0,1,206.37,88ZM107.59,42.4A135.28,135.28,0,0,0,85.29,88H49.63A88.29,88.29,0,0,1,107.59,42.4ZM49.63,168H85.29a135.28,135.28,0,0,0,22.3,45.6A88.29,88.29,0,0,1,49.63,168Zm98.78,45.6a135.28,135.28,0,0,0,22.3-45.6h35.66A88.29,88.29,0,0,1,148.41,213.6Z"/></svg>
            <span>\${customHostname}</span>
          </a>
        </div>
      \`;
    } else {
      // Show a friendly message instead of raw API errors
      let errorMsg = 'Waiting for DNS propagation';
      let errorDetail = '';
      
      if (errors.length > 0) {
        // Check for common error patterns and provide friendly messages
        const rawError = errors.join(' ');
        if (rawError.includes('A or AAAA records') || rawError.includes('ownership verification')) {
          errorMsg = 'Domain validation pending';
          errorDetail = 'Make sure you\\'ve added the CNAME record above, then wait a few minutes for DNS to propagate.';
        } else if (rawError.includes('API')) {
          errorMsg = 'Unable to check status';
          errorDetail = 'There was an issue connecting to the verification service. Please try again.';
        } else {
          errorMsg = 'Domain validation pending';
          errorDetail = 'Please verify your DNS settings and allow time for propagation.';
        }
      }
      
      bannerDiv.innerHTML = \`
        <div class="banner banner-warning" style="margin-bottom: 12px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm-8-80V80a8,8,0,0,1,16,0v56a8,8,0,0,1-16,0Zm20,36a12,12,0,1,1-12-12A12,12,0,0,1,140,172Z"/></svg>
          <p>\${errorMsg}</p>
        </div>
        \${errorDetail ? \`<p style="font-size: 13px; color: var(--kumo-muted-foreground); margin-bottom: 12px;">\${errorDetail}</p>\` : ''}
        <div style="display: flex; gap: 8px; align-items: center;">
          <button type="button" class="btn btn-secondary btn-sm" onclick="checkDomainStatus(window._domainParams.subdomain, window._domainParams.customHostname, window._domainParams.workerUrl)">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 256 256"><path d="M240,56v48a8,8,0,0,1-8,8H184a8,8,0,0,1,0-16H211.4L184.81,71.64A81.59,81.59,0,0,0,46.37,90.32a8,8,0,1,1-14.54-6.64A97.49,97.49,0,0,1,128,32a98.33,98.33,0,0,1,69.07,28.94L224,84.07V56a8,8,0,0,1,16,0Zm-32.16,109.68a81.65,81.65,0,0,1-138.45,18.68L44.6,160H72a8,8,0,0,0,0-16H24a8,8,0,0,0-8,8v48a8,8,0,0,0,16,0V171.93l26.94,24.13A97.51,97.51,0,0,0,225.54,172.32a8,8,0,0,0-14.54-6.64Z"/></svg>
            Check Again
          </button>
        </div>
      \`;
    }
    
  } catch (error) {
    bannerDiv.innerHTML = \`
      <div class="banner banner-error" style="margin-bottom: 12px;">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm-8-80V80a8,8,0,0,1,16,0v56a8,8,0,0,1-16,0Zm20,36a12,12,0,1,1-12-12A12,12,0,0,1,140,172Z"/></svg>
        <p>\${error.message}</p>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" onclick="checkDomainStatus(window._domainParams.subdomain, window._domainParams.customHostname, window._domainParams.workerUrl)">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 256 256"><path d="M240,56v48a8,8,0,0,1-8,8H184a8,8,0,0,1,0-16H211.4L184.81,71.64A81.59,81.59,0,0,0,46.37,90.32a8,8,0,1,1-14.54-6.64A97.49,97.49,0,0,1,128,32a98.33,98.33,0,0,1,69.07,28.94L224,84.07V56a8,8,0,0,1,16,0Zm-32.16,109.68a81.65,81.65,0,0,1-138.45,18.68L44.6,160H72a8,8,0,0,0,0-16H24a8,8,0,0,0-8,8v48a8,8,0,0,0,16,0V171.93l26.94,24.13A97.51,97.51,0,0,0,225.54,172.32a8,8,0,0,0-14.54-6.64Z"/></svg>
        Try Again
      </button>
    \`;
  }
}
</script>
`;
