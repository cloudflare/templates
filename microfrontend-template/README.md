# Cloudflare Vertical Microfrontend Router

A production-ready Cloudflare Workers router that enables **vertical microfrontend architecture** by routing requests to separate Worker services based on path expressions, while handling all the complex URL rewriting needed to make multiple apps appear as a single unified application.

## Overview

This router acts as a reverse proxy that:

- **Routes requests** to different Cloudflare Workers based on configurable path patterns (e.g., `/docs`, `/dashboard`, `/:tenant/app`)
- **Strips mount prefixes** before forwarding to upstream services (so `/docs/about` becomes `/about` for the docs service)
- **Rewrites HTML/CSS asset URLs** to maintain correct paths (so `/assets/logo.png` becomes `/docs/assets/logo.png` when served from the docs mount)
- **Handles redirects and cookies** by rewriting `Location` headers and `Set-Cookie` paths to maintain proper scoping
- **Optionally preloads routes** for faster navigation between microfrontends (uses Speculation Rules API for Chromium browsers, fallback script for others)
- **Optionally injects smooth view transition CSS** for native browser page transitions

## How It Works

### Request Flow

1. **Request arrives** at the router Worker (e.g., `https://example.com/docs/getting-started`)
2. **Route matching** finds the best matching route configuration based on the pathname
3. **Mount prefix is stripped** (e.g., `/docs/getting-started` → `/getting-started`)
4. **Request is forwarded** to the corresponding service binding Worker
5. **Response is transformed**:
   - HTML: Asset URLs in attributes (`href`, `src`, etc.) are rewritten
   - CSS: `url()` references to assets are rewritten
   - Redirects: `Location` headers are rewritten to include mount prefix
   - Cookies: `Set-Cookie` paths are rewritten to include mount prefix
6. **Response is returned** to the client

### Route Matching

Routes are matched using a **prefix mount** strategy:

- `/docs` matches `/docs`, `/docs/`, `/docs/about`, `/docs/guides/intro`, etc.
- Routes with parameters like `/:tenant/dashboard` match dynamically
- The **longest matching prefix wins** (most specific route is chosen)
- Route specificity is used for deterministic tie-breaking

### URL Rewriting

The router rewrites URLs to maintain proper asset resolution across microfrontends:

**Before rewriting:**

```html
<!-- Served from /docs mount -->
<img src="/assets/logo.png" />
<link rel="stylesheet" href="/static/app.css" />
```

**After rewriting:**

```html
<img src="/docs/assets/logo.png" />
<link rel="stylesheet" href="/docs/static/app.css" />
```

This ensures assets load correctly even though each microfrontend is deployed separately.

## Installation

```bash
npm install
```

## Configuration

### 1. Define Service Bindings

In your `wrangler.jsonc` (or `wrangler.toml`), configure service bindings to your Worker services:

```jsonc
{
	"services": [
		{
			"binding": "APP1", // Binding name used in ROUTES config
			"service": "my-docs-worker", // Name of your Worker service
		},
		{
			"binding": "APP2",
			"service": "my-dashboard-worker",
		},
	],
}
```

### 2. Configure Routes

Set the `ROUTES` environment variable as a JSON string. You can configure it in `wrangler.jsonc`:

```jsonc
{
	"vars": {
		"ROUTES": "{\"smoothTransitions\":true, \"routes\":[{\"binding\": \"APP1\", \"path\": \"/docs\", \"preload\":true}, {\"binding\": \"APP2\", \"path\": \"/dashboard\"}]}",
		"ASSET_PREFIXES": "[\"/cf-assets/\", \"/media/\"]",
	},
}
```

- `ROUTES` is **required** - defines your route mappings
- `ASSET_PREFIXES` is **optional** - adds custom asset prefixes (see [Custom Asset Prefixes](#custom-asset-prefixes))

You can also set these via the Cloudflare Dashboard or Wrangler secrets.

### Route Configuration Format

The `ROUTES` variable can be either:

**Simple array format:**

```json
[
	{ "binding": "APP1", "path": "/docs" },
	{ "binding": "APP2", "path": "/dashboard" }
]
```

**Object format with options:**

```json
{
	"smoothTransitions": true,
	"routes": [
		{ "binding": "APP1", "path": "/docs", "preload": true },
		{ "binding": "APP2", "path": "/dashboard" }
	]
}
```

### Route Options

| Option              | Type      | Description                                                                       |
| ------------------- | --------- | --------------------------------------------------------------------------------- |
| `binding`           | `string`  | **Required.** The service binding name (must match a binding in `wrangler.jsonc`) |
| `path`              | `string`  | **Required.** Path expression (e.g., `/docs`, `/:tenant/app`, `/api/:path*`)      |
| `preload`           | `boolean` | If `true`, preloads this route after DOM loads (only works for static mounts)     |
| `smoothTransitions` | `boolean` | If `true`, injects CSS for smooth view transitions (applies to all routes)        |

## Path Expression Syntax

### Static Paths

Simple literal paths match as prefix mounts:

```json
{"binding": "APP1", "path": "/docs"}        // Matches /docs, /docs/, /docs/anything
{"binding": "APP2", "path": "/dashboard"}   // Matches /dashboard, /dashboard/, /dashboard/user
```

### Dynamic Parameters

Use `:name` for dynamic path segments:

```json
{"binding": "APP1", "path": "/:tenant"}           // Matches /acme, /acme/dashboard
{"binding": "APP2", "path": "/:tenant/dashboard"} // Matches /acme/dashboard, /acme/dashboard/settings
```

### Wildcard Routes

Use `*` for zero or more segments, `+` for one or more:

```json
{"binding": "APP1", "path": "/api/:path*"}  // Matches /api, /api/users, /api/users/123
{"binding": "APP2", "path": "/app/:path+"}  // Matches /app/users, /app/users/123 (but NOT /app)
```

### Parameter Constraints

Use parentheses to add constraints:

```json
{"binding": "APP1", "path": "/:tenant(a|b|c)"}     // Only matches /a, /b, or /c
{"binding": "APP2", "path": "/:id(\\d+)"}          // Only matches numeric IDs
```

### Escaping Special Characters

Use backslash to escape special characters:

```json
{ "binding": "APP1", "path": "/\\(special\\)" } // Matches literal "/(special)"
```

### Root Route

Use `/` to handle the root path:

```json
{ "binding": "APP1", "path": "/" } // Matches / and serves as fallback for unmatched asset requests
```

## Asset URL Rewriting

### Supported Asset Prefixes

The router automatically rewrites URLs for these **default** asset path prefixes:

- `/assets/`
- `/static/`
- `/build/`
- `/_astro/`
- `/fonts/`

#### Custom Asset Prefixes

You can add custom asset prefixes via the `ASSET_PREFIXES` environment variable in your `wrangler.jsonc`:

```jsonc
{
	"vars": {
		"ASSET_PREFIXES": "[\"/cf-assets/\", \"/media/\", \"/public/\"]",
		"ROUTES": "[...]",
	},
}
```

Custom prefixes are **merged** with the default prefixes, so you get both. Duplicates are automatically removed.

**Format:** `ASSET_PREFIXES` must be a JSON array of strings. Each prefix:

- Should start with `/` and end with `/` (will be normalized automatically)
- Will be matched exactly as specified (case-sensitive)
- Can include any characters, but regex special characters are escaped

**Example:**

```jsonc
{
	"vars": {
		"ASSET_PREFIXES": "[\"/cf-assets/\", \"/my-custom-folder/\"]",
	},
}
```

This will result in URLs from `/assets/`, `/static/`, `/build/`, `/_astro/`, `/fonts/`, `/cf-assets/`, and `/my-custom-folder/` all being rewritten.

### HTML Attribute Rewriting

The following HTML attributes are automatically rewritten when they contain absolute paths starting with asset prefixes:

- `href`, `src`, `poster`, `content`, `action`, `cite`, `formaction`
- `manifest`, `ping`, `archive`, `code`, `codebase`, `data`, `url`
- `srcset` (parsed and rewritten per URL)
- `data-*` attributes: `data-src`, `data-href`, `data-url`, `data-srcset`, `data-background`, etc.
- Framework-specific: `component-url`, `astro-component-url`, `sveltekit-url`, `renderer-url`
- `background`, `xlink:href`

### CSS URL Rewriting

CSS `url()` references to asset paths are automatically rewritten:

```css
/* Before: */
background-image: url("/assets/bg.png");

/* After (when served from /docs mount): */
background-image: url("/docs/assets/bg.png");
```

### Favicon Rewriting

Favicon links are always rewritten, even if they don't match asset prefixes:

```html
<!-- Before: -->
<link rel="icon" href="/favicon.ico" />

<!-- After (when served from /docs mount): -->
<link rel="icon" href="/docs/favicon.ico" />
```

## Redirect Handling

When an upstream service returns a redirect (3xx status), the router:

1. Rewrites the `Location` header to include the mount prefix
2. Rewrites `Set-Cookie` paths to scope cookies to the mount

**Example:**

Upstream redirects to `/login` → Router rewrites to `/docs/login` (if mount is `/docs`)

## Cookie Path Scoping

Cookies set with `Path=/` are automatically rewritten to `Path=/mount/` to prevent cookie collisions between microfrontends:

**Before:**

```
Set-Cookie: session=abc123; Path=/
```

**After (when mount is `/docs`):**

```
Set-Cookie: session=abc123; Path=/docs/
```

## Route Preloading

When `preload: true` is set on a static mount route, the router automatically preloads those routes to enable faster navigation. The router uses **browser-specific optimization** to provide the best performance for each browser:

### Chromium Browsers (Chrome, Edge, Opera, Brave)

For Chromium-based browsers, the router uses the **Speculation Rules API** - a modern, browser-native prefetching mechanism:

- Injects `<script type="speculationrules">` into the `<head>` element
- Browser handles prefetching automatically with optimal priority management
- Respects user preferences (battery saver, data saver modes)
- Uses per-document in-memory cache for faster access
- Not blocked by Cache-Control headers
- More efficient than JavaScript-based fetching

**Example injected speculation rules:**

```json
{
	"prefetch": [
		{
			"urls": ["/app1", "/app2", "/dashboard"]
		}
	]
}
```

### Other Browsers (Firefox, Safari)

For browsers that don't yet support the Speculation Rules API, the router falls back to a JavaScript-based preload script:

- Injects `<script src="/mount/__mf-preload.js" defer></script>` into the `<body>` element
- Script fetches preload routes after DOM loads
- Uses external script (CSP-friendly) instead of inline JavaScript
- Uses `GET` requests with `credentials: "same-origin"` and `cache: "default"`

**Browser Detection:**
The router automatically detects the browser from the `User-Agent` header and injects the appropriate preload mechanism. No configuration needed!

**Limitations:**

- Only works for **static mounts** (no dynamic parameters)
- Only preloads routes that are not the current route
- Static mounts must have `preload: true` in their route configuration

**Example Configuration:**

```json
{
	"routes": [
		{ "binding": "APP1", "path": "/app1", "preload": true },
		{ "binding": "APP2", "path": "/app2", "preload": true },
		{ "binding": "APP3", "path": "/:tenant/dashboard" } // Cannot preload (dynamic parameter)
	]
}
```

When a user visits `/app1`, the router will automatically preload `/app2` (but not `/app1` since that's the current route).

## Smooth View Transitions

When `smoothTransitions: true` is enabled, the router injects CSS for smooth browser-native view transitions:

```css
@supports (view-transition-name: none) {
	::view-transition-old(root),
	::view-transition-new(root) {
		animation-duration: 0.3s;
		animation-timing-function: ease-in-out;
	}
	main {
		view-transition-name: main-content;
	}
	nav {
		view-transition-name: navigation;
	}
}
```

This enables seamless transitions when navigating between microfrontends using the View Transition API.

## Examples

### Basic Setup

**wrangler.jsonc:**

```jsonc
{
	"services": [
		{ "binding": "DOCS", "service": "docs-worker" },
		{ "binding": "DASH", "service": "dashboard-worker" },
	],
	"vars": {
		"ROUTES": "[{\"binding\": \"DOCS\", \"path\": \"/docs\"}, {\"binding\": \"DASH\", \"path\": \"/dashboard\"}]",
	},
}
```

### Multi-Tenant Setup

**wrangler.jsonc:**

```jsonc
{
	"services": [{ "binding": "TENANT_APP", "service": "tenant-worker" }],
	"vars": {
		"ROUTES": "[{\"binding\": \"TENANT_APP\", \"path\": \"/:tenant/app\"}]",
	},
}
```

Matches `/acme/app`, `/corp/app`, etc.

### Advanced Configuration

**wrangler.jsonc:**

```jsonc
{
	"services": [
		{ "binding": "APP1", "service": "app1-worker" },
		{ "binding": "APP2", "service": "app2-worker" },
		{ "binding": "ROOT", "service": "root-worker" },
	],
	"vars": {
		"ROUTES": "{\"smoothTransitions\":true, \"routes\":[{\"binding\": \"ROOT\", \"path\": \"/\"}, {\"binding\": \"APP1\", \"path\": \"/app1\", \"preload\":true}, {\"binding\": \"APP2\", \"path\": \"/app2\", \"preload\":true}]}",
	},
}
```

## Development

```bash
# Start local development server
npm run dev

# Type check
npm run types

# Deploy to Cloudflare
npm run deploy
```

## Architecture Decisions

### Why Prefix Mounting?

Prefix mounting allows each microfrontend to be developed independently without knowing its mount path. The router handles all the URL rewriting, so your apps can use absolute paths like `/assets/logo.png` and they'll work correctly regardless of mount.

### Why Browser-Specific Preloading?

The router uses **progressive enhancement** for route preloading:

- **Chromium browsers** get the modern Speculation Rules API, which is more efficient, respects user preferences, and provides better performance
- **Other browsers** get a JavaScript-based fallback that works reliably across all browsers
- This approach ensures optimal performance where supported, with graceful degradation elsewhere

The external preload script (`/mount/__mf-preload.js`) used for non-Chromium browsers is CSP-friendly and easier to debug than inline JavaScript. It also allows browsers to cache the preload logic.

### Why Service Bindings?

Service bindings allow direct Worker-to-Worker communication without going through HTTP, reducing latency and enabling better integration with Cloudflare's edge network.

## Limitations

1. **Asset Prefixes**: Default asset prefixes are always included. Custom prefixes can be added via the `ASSET_PREFIXES` environment variable (see [Custom Asset Prefixes](#custom-asset-prefixes) above).
2. **Preloading**: Only works for static mounts (routes without parameters).
3. **Root Mount**: The root route (`/`) requires special handling and may not strip prefixes correctly for all asset requests.
4. **CSS Parsing**: CSS `url()` rewriting uses regex, so complex CSS with nested functions may not be rewritten correctly.
5. **HTML Parsing**: Uses Cloudflare's HTMLRewriter, which may not handle all edge cases with malformed HTML.

## Troubleshooting

### Assets Not Loading

- Check that your asset paths start with one of the supported prefixes (`/assets/`, `/static/`, etc.)
- Verify the mount prefix is being correctly prepended in the rewritten HTML
- Check browser console for 404 errors on asset requests

### Routes Not Matching

- Ensure your path expressions are correct (check escaping of special characters)
- Remember that routes match as prefixes, so `/docs` matches `/docs/anything`
- Check route specificity - more specific routes win

### Redirects Going to Wrong Path

- Verify that `Location` headers are being rewritten correctly
- Check that redirects from upstream services use absolute paths (not relative)

### Cookies Not Scoped Correctly

- Ensure cookies use `Path=/` in the upstream service (the router will rewrite them)
- Check that `Set-Cookie` headers are being processed correctly

## Contributing

Contributions are welcome! Please open an issue or pull request.

## License

MIT

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/microfrontend-template)
