/**
 * Deploy page UI.
 *
 * Self-contained HTML, CSS, and JavaScript for the drag-and-drop deploy
 * experience. No build step, no framework -- just template literals.
 *
 * The visual design mirrors the Cloudflare Drop-style reference UI: an
 * orange oklch palette, Inter / Inter Tight typography,
 * a dotted "drop canvas", soft cards, and pill buttons.
 */

// ── Public renderers ─────────────────────────────────────────────────────────

export function renderShell(
	body: string,
	options: {
		title?: string;
		eyebrow?: string;
		heading?: string;
		siteDomain?: string;
		deployPath?: string;
	} = {},
): string {
	const title = options.title || "Internal Sites";
	const deployPath = options.deployPath || "/deploy";

	const eyebrow = options.eyebrow
		? `<p class="eyebrow">${esc(options.eyebrow)}</p>`
		: "";
	const heading = options.heading
		? `<h1 class="display-tight page-title${options.eyebrow ? " has-eyebrow" : ""}">${esc(options.heading)}</h1>`
		: "";

	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@600;700;800&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>${CSS}</style>
</head>
<body>
  <div class="page-glow">
    <header class="site-header">
      <a href="${esc(deployPath)}" class="brand">Internal Sites</a>
      <nav class="nav">
        <a href="${esc(deployPath)}" class="nav-link">Deploy</a>
        <a href="/admin" class="nav-link">Admin</a>
      </nav>
    </header>
    <main class="page">
      ${eyebrow}
      ${heading}
      ${body}
    </main>
  </div>
  <script>
    window.INTERNAL_SITE_DOMAIN = ${JSON.stringify(options.siteDomain || "")};
    window.INTERNAL_DEPLOY_PATH = ${JSON.stringify(options.deployPath || "/deploy")};
  </script>
</body>
</html>`;
}

export function renderDeployPage(options: {
	siteDomain: string;
	deployPath: string;
}): string {
	return renderShell(
		`
    <p class="lede">Drop a site. Get a URL.</p>
    <p class="sublede">Upload static files and publish them behind company login.</p>

    <form id="deploy-form">
      <div class="settings-grid">
        <label class="field">
          <span>Site name</span>
          <input id="site-name" name="name" required placeholder="Team handbook" autocomplete="off">
        </label>

        <label class="field">
          <span>Internal URL</span>
          <div class="url-row">
            <input id="site-slug" name="slug" required pattern="[a-z0-9-]+" placeholder="team-handbook" autocomplete="off">
            <strong>.${esc(options.siteDomain)}</strong>
          </div>
        </label>
      </div>

      <div id="drop-zone" class="drop-canvas">
        <span class="drop-outline" aria-hidden="true"></span>
        <h2 class="display-tight drop-title">Drop a folder. Or a zip.</h2>
        <p class="drop-sub">Static files only &mdash; HTML, CSS, JS. Published behind company login.</p>
        <div class="drop-actions">
          <button class="pill-button" type="button" id="folder-button">Browse folders</button>
          <button class="pill-button" type="button" id="zip-button">Browse zips</button>
        </div>
        <input id="file-input" type="file" webkitdirectory multiple hidden>
        <input id="zip-input" type="file" accept=".zip,application/zip" hidden>
      </div>

      <div id="file-card" class="soft-card file-card" hidden>
        <div class="file-card-header">
          <h2 id="upload-heading">Uploading 0 total file(s)</h2>
          <button class="remove-button" type="button" id="remove-all">Remove all</button>
        </div>
        <ul id="file-summary" class="file-list"></ul>
      </div>

      <div id="validation" aria-live="polite"></div>

      <button id="deploy-button" class="primary" type="submit" disabled>Deploy site</button>
    </form>

    <div id="result" class="result" aria-live="polite"></div>

    <p class="note">
      <strong>Protected by default.</strong>
      Every site requires company login via Cloudflare Access.
    </p>

    <script>${DEPLOY_SCRIPT}</script>
  `,
		{
			title: "Deploy Site",
			heading: "Upload and deploy",
			siteDomain: options.siteDomain,
			deployPath: options.deployPath,
		},
	);
}

export function renderNotFound(
	siteDomain: string,
	deployPath: string,
): string {
	return renderShell(
		`
    <p class="lede">No site is configured for this URL.</p>
    <a class="link-button" href="${esc(deployPath)}">Deploy a site</a>
  `,
		{
			title: "Site not found",
			eyebrow: "404",
			heading: "Site not found",
			siteDomain,
			deployPath,
		},
	);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function esc(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

// ── Styles ───────────────────────────────────────────────────────────────────

const CSS = `
:root {
  color-scheme: light;
  --radius: 0.625rem;
  --background: oklch(0.985 0.006 60);
  --foreground: oklch(0.17 0.005 60);
  --canvas: oklch(0.68 0.213 39);
  --canvas-foreground: oklch(0.99 0.005 60);
  --brand: oklch(0.68 0.213 39);
  --brand-strong: oklch(0.63 0.226 34);
  --brand-foreground: oklch(0.99 0.005 60);
  --success: oklch(0.48 0.117 158);
  --success-foreground: oklch(0.99 0.005 60);
  --success-surface: oklch(0.955 0.045 158);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.17 0.005 60);
  --primary: oklch(0.68 0.213 39);
  --muted: oklch(0.965 0.008 60);
  --muted-foreground: oklch(0.52 0.014 55);
  --accent: oklch(0.955 0.02 55);
  --destructive: oklch(0.577 0.245 27.325);
  --destructive-surface: oklch(0.971 0.03 20);
  --border: oklch(0.9 0.01 60);
  --font-display: "Inter Tight", "Inter", system-ui, sans-serif;
  --font-sans: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-family: var(--font-sans);
}

* { box-sizing: border-box; }
[hidden] { display: none !important; }

body {
  margin: 0;
  background: var(--background);
  color: var(--foreground);
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

h1, h2, h3, h4, h5, h6 { font-family: var(--font-display); }

/* ── Utilities ─────────────────────────────────────────── */

.page-glow {
  min-height: 100vh;
  background:
    radial-gradient(ellipse 80% 40% at 50% -10%, var(--canvas-foreground) 0%, transparent 70%),
    var(--background);
}

.display-tight {
  font-family: var(--font-display);
  font-weight: 700;
  letter-spacing: -0.025em;
}

.soft-card {
  border: 1px solid var(--border);
  background: var(--card);
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
}

/* ── Page shell ────────────────────────────────────────── */

.site-header {
  align-items: center;
  display: flex;
  justify-content: space-between;
  margin: 0 auto;
  max-width: 64rem;
  padding: 2rem 1.25rem 0;
}

.brand {
  color: var(--brand);
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: -0.025em;
  text-decoration: none;
  text-transform: uppercase;
}

.nav {
  align-items: center;
  display: flex;
  font-size: 0.875rem;
  font-weight: 600;
  gap: 0.25rem;
}

.nav-link {
  border-radius: 9999px;
  color: oklch(0.17 0.005 60 / 0.7);
  padding: 0.5rem 1rem;
  text-decoration: none;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.nav-link:hover {
  background: var(--card);
  color: var(--foreground);
}

.page {
  margin: 0 auto;
  max-width: 64rem;
  padding: 1.5rem 1.25rem 5rem;
}

/* ── Page title ────────────────────────────────────────── */

.eyebrow {
  color: var(--brand);
  font-family: var(--font-display);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.22em;
  margin: 0;
  text-transform: uppercase;
}

.page-title {
  font-size: clamp(3rem, 7vw, 4.5rem);
  line-height: 1;
  margin: 0;
}

.page-title.has-eyebrow { margin-top: 0.75rem; }

.lede {
  color: var(--muted-foreground);
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: -0.025em;
  margin: 1.25rem 0 0;
}

.sublede {
  color: var(--muted-foreground);
  font-size: 1rem;
  margin: 0.5rem 0 0;
}

/* ── Settings grid ─────────────────────────────────────── */

.settings-grid {
  display: grid;
  gap: 1.25rem;
  grid-template-columns: 1fr;
  margin-top: 2.5rem;
}

.field { display: block; }

.field > span {
  display: block;
  font-size: 0.875rem;
  font-weight: 700;
}

input {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 1rem;
  color: var(--foreground);
  font: inherit;
  font-size: 1rem;
  margin-top: 0.5rem;
  outline: none;
  padding: 1rem 1.25rem;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  width: 100%;
}

input::placeholder { color: var(--muted-foreground); }

input:focus {
  border-color: var(--brand);
  box-shadow: 0 0 0 4px oklch(0.68 0.213 39 / 0.15);
}

.url-row {
  align-items: center;
  display: grid;
  gap: 0.75rem;
  grid-template-columns: minmax(0, 1fr) auto;
  margin-top: 0.5rem;
}

.url-row input { margin-top: 0; min-width: 0; }

.url-row strong {
  color: var(--muted-foreground);
  font-size: 0.875rem;
  font-weight: 700;
  white-space: nowrap;
}

/* ── Drop canvas ───────────────────────────────────────── */

.drop-canvas {
  background-color: var(--canvas);
  border-radius: 1.5rem;
  box-shadow:
    inset 0 1px 0 0 rgba(255, 255, 255, 0.18),
    0 20px 50px -12px rgba(246, 130, 31, 0.35);
  display: grid;
  margin-top: 2rem;
  padding: 6rem 1.5rem;
  place-items: center;
  position: relative;
  text-align: center;
  transition: transform 0.2s ease;
}

.drop-canvas.dragging { transform: scale(1.01); }

.drop-outline {
  border: 2px dashed var(--canvas-foreground);
  border-radius: 1rem;
  inset: 0.75rem;
  opacity: 0;
  pointer-events: none;
  position: absolute;
  transition: opacity 0.2s ease;
}

.drop-canvas.dragging .drop-outline { opacity: 1; }

.drop-title {
  color: var(--canvas-foreground);
  font-size: clamp(2.25rem, 5vw, 3rem);
  margin: 0;
}

.drop-sub {
  color: oklch(0.99 0.005 60 / 0.85);
  margin: 1rem 0 0;
}

.drop-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: center;
  margin-top: 2rem;
}

.pill-button {
  background: var(--card);
  border: 0;
  border-radius: 9999px;
  color: var(--foreground);
  cursor: pointer;
  font: inherit;
  font-size: 1rem;
  font-weight: 700;
  padding: 0.75rem 1.75rem;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
  transition: transform 0.15s ease;
}

.pill-button:hover { transform: translateY(-2px); }

/* ── File list card ────────────────────────────────────── */

.file-card {
  border-radius: 1.5rem;
  margin-top: 2rem;
  overflow: hidden;
}

.file-card-header {
  align-items: center;
  border-bottom: 1px solid var(--border);
  display: flex;
  gap: 1rem;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
}

.file-card-header h2 {
  font-family: var(--font-display);
  font-size: 1.125rem;
  font-weight: 700;
  margin: 0;
}

.remove-button {
  background: transparent;
  border: 0;
  color: var(--muted-foreground);
  cursor: pointer;
  font: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  padding: 0;
  transition: color 0.15s ease;
}

.remove-button:hover { color: var(--foreground); }

.file-list {
  list-style: none;
  margin: 0;
  max-height: 420px;
  overflow: auto;
  padding: 0;
}

.file-row {
  align-items: center;
  display: flex;
  font-size: 0.875rem;
  gap: 0.75rem;
  padding: 0.75rem 1.5rem;
}

.file-row + .file-row { border-top: 1px solid oklch(0.9 0.01 60 / 0.6); }

.file-icon {
  color: var(--muted-foreground);
  flex: 0 0 auto;
  height: 1rem;
  width: 1rem;
}

.file-name {
  color: var(--foreground);
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  color: var(--muted-foreground);
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
}

.file-check {
  color: var(--brand);
  flex: 0 0 auto;
  height: 1rem;
  width: 1rem;
}

/* ── Buttons ───────────────────────────────────────────── */

.primary {
  background: var(--brand);
  border: 0;
  border-radius: 9999px;
  color: var(--brand-foreground);
  cursor: pointer;
  font: inherit;
  font-size: 1rem;
  font-weight: 700;
  margin-top: 1.5rem;
  padding: 1rem;
  box-shadow: 0 10px 15px -3px rgba(246, 130, 31, 0.25), 0 4px 6px -4px rgba(246, 130, 31, 0.2);
  transition: background-color 0.2s ease, opacity 0.2s ease;
  width: 100%;
}

.primary:hover:not(:disabled) { background: var(--brand-strong); }

.primary:disabled {
  box-shadow: none;
  cursor: not-allowed;
  opacity: 0.45;
}

.link-button {
  background: var(--foreground);
  border-radius: 9999px;
  color: var(--background);
  display: inline-block;
  font-weight: 700;
  margin-top: 1.5rem;
  padding: 0.75rem 1.5rem;
  text-decoration: none;
}

/* ── Result ────────────────────────────────────────────── */

.result:empty { margin: 0; }
.result { margin-top: 1.5rem; }

.result-card {
  border-radius: 1.5rem;
  padding: 1.5rem;
}

.result-card.success {
  background: var(--success-surface);
  border: 1px solid oklch(0.48 0.117 158 / 0.25);
}

.result-card.error {
  background: var(--destructive-surface);
  border: 1px solid oklch(0.577 0.245 27.325 / 0.25);
}

.result-title {
  font-weight: 700;
  margin: 0;
}

.result-card.success .result-title { color: var(--success); }
.result-card.error .result-title { color: var(--destructive); }

.result-url {
  color: var(--success);
  display: block;
  font-weight: 700;
  margin-top: 0.5rem;
  overflow-wrap: anywhere;
  text-decoration: underline;
}

.result-card.error p:not(.result-title) {
  color: var(--destructive);
  margin: 0.5rem 0 0;
}

/* ── Upload validation checklist ───────────────────────── */

#validation:empty { display: none; }
#validation { margin-top: 1rem; }

.check-list {
  list-style: none;
  margin: 0.75rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.check-item {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  font-size: 0.875rem;
}

.check-item .check-icon {
  font-size: 0.75rem;
  font-weight: 700;
  flex-shrink: 0;
  width: 1rem;
  text-align: center;
}

.check-item.pass { color: var(--success); }
.check-item.fail { color: var(--destructive); }

.result-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1rem;
}

.action-primary,
.action-secondary {
  border-radius: 9999px;
  cursor: pointer;
  font: inherit;
  font-size: 0.875rem;
  font-weight: 700;
  padding: 0.75rem 1.5rem;
  text-decoration: none;
}

.action-primary {
  background: var(--foreground);
  border: 0;
  color: var(--background);
}

.action-secondary {
  background: var(--card);
  border: 1px solid oklch(0.48 0.117 158 / 0.3);
  color: var(--success);
}

/* ── Note ──────────────────────────────────────────────── */

.note {
  color: var(--muted-foreground);
  font-size: 0.875rem;
  margin-top: 1.5rem;
}

.note strong { color: var(--foreground); }

/* ── Admin page ────────────────────────────────────────── */

.admin-signed-in {
  color: var(--muted-foreground);
  font-size: 0.875rem;
  margin: 0.5rem 0 2.5rem;
}

.admin-section {
  margin-top: 2.5rem;
}

.admin-section-label {
  color: var(--brand);
  font-family: var(--font-display);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  margin: 0 0 0.75rem;
  text-transform: uppercase;
}

.admin-table-wrap {
  border: 1px solid var(--border);
  border-radius: 1rem;
  overflow: hidden;
  overflow-x: auto;
}

.admin-table {
  border-collapse: collapse;
  font-size: 0.875rem;
  min-width: 100%;
}

.admin-table thead {
  background: var(--muted);
}

.admin-table th {
  color: var(--muted-foreground);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  padding: 0.625rem 1rem;
  text-align: left;
  text-transform: uppercase;
  white-space: nowrap;
}

.admin-table td {
  border-top: 1px solid var(--border);
  color: var(--foreground);
  padding: 0.75rem 1rem;
  vertical-align: middle;
  white-space: nowrap;
}

.admin-table tbody tr:hover { background: var(--muted); }

.admin-link {
  color: var(--brand);
  font-weight: 600;
  text-decoration: none;
}

.admin-link:hover { text-decoration: underline; }

.admin-mono {
  color: var(--muted-foreground);
  font-size: 0.8125rem;
}

.admin-num {
  font-variant-numeric: tabular-nums;
}

.admin-null { color: var(--muted-foreground); }

.admin-empty {
  color: var(--muted-foreground);
  font-size: 0.875rem;
  margin: 0;
  padding: 1.25rem 1rem;
  border: 1px solid var(--border);
  border-radius: 1rem;
}

.admin-error {
  color: var(--destructive);
  font-size: 0.875rem;
  margin: 0;
}

/* ── Responsive ────────────────────────────────────────── */

@media (min-width: 640px) {
  .site-header { padding-left: 2rem; padding-right: 2rem; }
  .page { padding-left: 2rem; padding-right: 2rem; }
  .settings-grid { grid-template-columns: 1fr 1fr; }
}

@media (max-width: 640px) {
  .url-row { grid-template-columns: 1fr; }
  .url-row strong { white-space: normal; }
  .drop-canvas { padding: 4rem 1.5rem; }
}
`;

// ── Client-side deploy script ────────────────────────────────────────────────

const DEPLOY_SCRIPT = `
const form = document.getElementById("deploy-form");
const nameInput = document.getElementById("site-name");
const slugInput = document.getElementById("site-slug");
const dropZone = document.getElementById("drop-zone");
const fileCard = document.getElementById("file-card");
const fileInput = document.getElementById("file-input");
const zipInput = document.getElementById("zip-input");
const folderButton = document.getElementById("folder-button");
const zipButton = document.getElementById("zip-button");
const fileSummary = document.getElementById("file-summary");
const uploadHeading = document.getElementById("upload-heading");
const removeAllButton = document.getElementById("remove-all");
const deployButton = document.getElementById("deploy-button");
const result = document.getElementById("result");
const validation = document.getElementById("validation");

var MAX_FILES = 1000;
var MAX_FILE_BYTES = 25 * 1024 * 1024;  // 25 MiB
var MAX_TOTAL_BYTES = 50 * 1024 * 1024; // 50 MiB

let selectedFiles = [];
let selectedPaths = [];
let isZipSelection = false;

// ── Auto-slug from name ──────────────────────────────────

nameInput.addEventListener("input", function () {
  if (!slugInput.dataset.touched) {
    slugInput.value = slugify(nameInput.value);
  }
});

slugInput.addEventListener("input", function () {
  slugInput.dataset.touched = "true";
  slugInput.value = slugify(slugInput.value);
});

// ── Browse buttons ───────────────────────────────────────

folderButton.addEventListener("click", function () { fileInput.click(); });
zipButton.addEventListener("click", function () { zipInput.click(); });
removeAllButton.addEventListener("click", clearSelection);

fileInput.addEventListener("change", function () {
  setFiles(Array.from(fileInput.files || []), false);
});
zipInput.addEventListener("change", function () {
  setFiles(Array.from(zipInput.files || []), true);
});

// ── Drag and drop ────────────────────────────────────────

["dragenter", "dragover"].forEach(function (eventName) {
  dropZone.addEventListener(eventName, function (event) {
    event.preventDefault();
    dropZone.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach(function (eventName) {
  dropZone.addEventListener(eventName, function (event) {
    event.preventDefault();
    dropZone.classList.remove("dragging");
  });
});

dropZone.addEventListener("drop", async function (event) {
  var items = Array.from(event.dataTransfer.items || []);
  var files = Array.from(event.dataTransfer.files || []);

  if (items.some(function (item) { return item.webkitGetAsEntry; })) {
    var collected = [];
    for (var i = 0; i < items.length; i++) {
      var entry = items[i].webkitGetAsEntry && items[i].webkitGetAsEntry();
      if (entry) await collectEntryFiles(entry, "", collected);
    }
    selectedFiles = collected.map(function (item) { return item.file; });
    selectedPaths = collected.map(function (item) { return item.path; });
    isZipSelection = false;
    renderFileSummary();
    return;
  }

  setFiles(files, files.length === 1 && files[0].name.toLowerCase().endsWith(".zip"));
});

// ── Form submit ──────────────────────────────────────────

form.addEventListener("submit", async function (event) {
  event.preventDefault();
  result.innerHTML = "";
  deployButton.disabled = true;
  deployButton.textContent = "Deploying...";

  try {
    var body = new FormData();
    body.set("name", nameInput.value);
    body.set("slug", slugInput.value);
    body.set("paths", JSON.stringify(selectedPaths));

    selectedFiles.forEach(function (file, index) {
      body.append("files", file, selectedPaths[index] || file.name);
    });

    var response = await fetch("/api/sites/deploy", { method: "POST", body: body });
    var data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Deploy failed");
    }

    result.innerHTML =
      '<div class="result-card success">' +
      '<p class="result-title">Site deployed.</p>' +
      '<a class="result-url" href="' + data.url + '" target="_blank" rel="noreferrer">' + data.url + "</a>" +
      '<div class="result-actions">' +
      '<a class="action-primary" href="' + data.url + '" target="_blank" rel="noreferrer">Open site</a>' +
      '<button class="action-secondary" type="button" id="copy-link">Copy link</button>' +
      "</div></div>";

    var copyButton = document.getElementById("copy-link");
    if (copyButton) {
      copyButton.addEventListener("click", async function () {
        await navigator.clipboard.writeText(data.url);
        copyButton.textContent = "Copied";
        setTimeout(function () { copyButton.textContent = "Copy link"; }, 1400);
      });
    }
  } catch (error) {
    result.innerHTML =
      '<div class="result-card error"><p class="result-title">Deploy failed.</p><p>' +
      escapeHtml(error.message) +
      "</p></div>";
  } finally {
    deployButton.textContent = "Deploy site";
    // Re-evaluate validation state (don't just check length — limits may apply)
    renderFileSummary();
  }
});

// ── File selection helpers ───────────────────────────────

function setFiles(files, isZip) {
  selectedFiles = files;
  selectedPaths = files.map(function (file) {
    return isZip ? file.name : (file.webkitRelativePath || file.name);
  });
  isZipSelection = isZip;
  renderFileSummary();
}

function clearSelection() {
  selectedFiles = [];
  selectedPaths = [];
  isZipSelection = false;
  fileInput.value = "";
  zipInput.value = "";
  result.innerHTML = "";
  renderFileSummary();
}

/**
 * Compute upload limit violations client-side, mirroring the backend
 * constants in src/assets.ts. Returns an array of check objects.
 * For ZIP uploads only the zip file size can be checked; the rest
 * require the backend to extract and inspect.
 */
function computeViolations() {
  var checks = [];

  if (isZipSelection) {
    var zipSize = (selectedFiles.length === 1) ? selectedFiles[0].size : 0;
    checks.push({
      label: "Total size under " + formatBytes(MAX_TOTAL_BYTES),
      detail: zipSize > MAX_TOTAL_BYTES ? "zip is " + formatBytes(zipSize) : null,
      pass: zipSize <= MAX_TOTAL_BYTES
    });
    return checks;
  }

  // File count
  var count = selectedFiles.length;
  checks.push({
    label: "Under " + MAX_FILES.toLocaleString() + " files",
    detail: count > MAX_FILES ? count.toLocaleString() + " files selected" : null,
    pass: count <= MAX_FILES
  });

  // Per-file size + total size + index.html in one pass
  var totalBytes = 0;
  var oversizedName = null;

  // Detect common top-level folder (mirrors stripCommonTopLevelFolder in assets.ts)
  var firstSegments = selectedPaths.map(function (p) {
    return (p || "").replace(/\\\\/g, "/").split("/")[0];
  });
  var commonPrefix = firstSegments[0];
  var hasCommonPrefix = commonPrefix && firstSegments.every(function (s) { return s === commonPrefix; });

  var hasIndex = false;
  for (var i = 0; i < selectedFiles.length; i++) {
    var file = selectedFiles[i];
    totalBytes += file.size;
    if (!oversizedName && file.size > MAX_FILE_BYTES) {
      oversizedName = file.name;
    }
    var rawPath = (selectedPaths[i] || file.name).replace(/\\\\/g, "/").replace(/^\\/+/, "");
    var strippedPath = hasCommonPrefix ? rawPath.split("/").slice(1).join("/") : rawPath;
    if (strippedPath === "index.html") {
      hasIndex = true;
    }
  }

  // Per-file size
  checks.push({
    label: "Max " + formatBytes(MAX_FILE_BYTES) + " per file",
    detail: oversizedName ? oversizedName + " exceeds limit" : null,
    pass: !oversizedName
  });

  // Total size
  checks.push({
    label: "Total size under " + formatBytes(MAX_TOTAL_BYTES),
    detail: totalBytes > MAX_TOTAL_BYTES ? formatBytes(totalBytes) + " selected" : null,
    pass: totalBytes <= MAX_TOTAL_BYTES
  });

  // index.html
  checks.push({
    label: "index.html present at root",
    detail: null,
    pass: hasIndex
  });

  return checks;
}

function renderFileSummary() {
  if (selectedFiles.length === 0) {
    dropZone.hidden = false;
    fileCard.hidden = true;
    fileSummary.innerHTML = "";
    validation.innerHTML = "";
    deployButton.disabled = true;
    return;
  }

  dropZone.hidden = true;
  fileCard.hidden = false;
  uploadHeading.textContent = "Uploading " + selectedFiles.length + " total file(s)";
  fileSummary.innerHTML = renderFileRows(selectedFiles, selectedPaths);

  // ZIP format check (must be exactly one .zip file)
  if (isZipSelection) {
    var validZip = selectedFiles.length === 1 && selectedFiles[0].name.toLowerCase().endsWith(".zip");
    if (!validZip) {
      validation.innerHTML = "";
      deployButton.disabled = true;
      return;
    }
  }

  var checks = computeViolations();
  var anyFail = checks.some(function (c) { return !c.pass; });

  if (anyFail) {
    var items = checks.map(function (c) {
      var cls = c.pass ? "pass" : "fail";
      var icon = c.pass ? "&#x2713;" : "&#x2717;";
      var text = c.label + (c.detail ? " \u2014 " + escapeHtml(c.detail) : "");
      return '<li class="check-item ' + cls + '"><span class="check-icon">' + icon + '</span>' + text + "</li>";
    }).join("");
    validation.innerHTML =
      '<div class="result-card error">' +
      '<p class="result-title">Missing requirements</p>' +
      '<ul class="check-list">' + items + "</ul>" +
      "</div>";
    deployButton.disabled = true;
  } else {
    validation.innerHTML = "";
    deployButton.disabled = false;
  }
}

function renderFileRows(files, paths) {
  var rows = buildDisplayRows(files, paths);
  var visibleRows = rows.slice(0, 100).map(renderDisplayRow).join("");
  var remaining = rows.length > 100
    ? '<li class="file-row"><span class="file-name">+' + (rows.length - 100) + " more items</span></li>"
    : "";
  return visibleRows + remaining;
}

function buildDisplayRows(files, paths) {
  var rows = [];
  var seenDirs = new Set();

  files.forEach(function (file, index) {
    var normalizedPath = (paths[index] || file.name).replace(/\\\\/g, "/");
    var parts = normalizedPath.split("/").filter(Boolean);
    var fileName = parts[parts.length - 1] || file.name;

    for (var depth = 0; depth < parts.length - 1; depth++) {
      var dirPath = parts.slice(0, depth + 1).join("/");
      if (!seenDirs.has(dirPath)) {
        seenDirs.add(dirPath);
        rows.push({ type: "folder", name: parts[depth], path: dirPath, size: 0, depth: depth });
      }
    }

    if (fileName.startsWith(".")) return;

    rows.push({ type: "file", name: fileName, path: normalizedPath, size: file.size, depth: Math.max(0, parts.length - 1) });
  });

  return rows;
}

function renderDisplayRow(row) {
  var indent = 1.5 + row.depth * 1.25;
  return '<li class="file-row" style="padding-left: ' + indent + 'rem">' +
    rowIcon(row.type) +
    '<span class="file-name" title="' + escapeHtml(row.path) + '">' + escapeHtml(row.name) + "</span>" +
    '<span class="file-size">' + formatBytes(row.size) + "</span>" +
    checkIcon() + "</li>";
}

function rowIcon(type) {
  if (type === "folder") {
    return '<svg class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>';
  }
  return '<svg class="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>';
}

function checkIcon() {
  return '<svg class="file-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
}

// ── Directory traversal ──────────────────────────────────

async function collectEntryFiles(entry, prefix, collected) {
  if (entry.isFile) {
    var file = await new Promise(function (resolve, reject) { entry.file(resolve, reject); });
    collected.push({ file: file, path: prefix + file.name });
    return;
  }

  if (entry.isDirectory) {
    var reader = entry.createReader();
    var entries = await readAllDirectoryEntries(reader);
    for (var i = 0; i < entries.length; i++) {
      await collectEntryFiles(entries[i], prefix + entry.name + "/", collected);
    }
  }
}

async function readAllDirectoryEntries(reader) {
  var entries = [];
  while (true) {
    var batch = await new Promise(function (resolve, reject) { reader.readEntries(resolve, reject); });
    if (!batch.length) return entries;
    entries.push.apply(entries, batch);
  }
}

// ── Utilities ────────────────────────────────────────────

function slugify(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63);
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KiB";
  return (bytes / 1024 / 1024).toFixed(1) + " MiB";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, function (ch) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
  });
}
`;
