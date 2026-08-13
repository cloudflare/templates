/**
 * Shared HTML escaping utilities.
 *
 * Used by ui.ts, index.ts, and render.ts to avoid duplicating the same
 * escape logic across multiple files.
 */

/** Escape a string for safe inclusion in HTML text or attribute values. */
export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/**
 * Safely serialize a value for embedding inside a `<script>` tag.
 *
 * Uses JSON.stringify and then escapes `<` as `\u003c` to prevent
 * a `</script>` sequence in the value from closing the script block.
 */
export function jsonForScript(value: unknown): string {
	return JSON.stringify(value).replace(/</g, "\\u003c");
}
