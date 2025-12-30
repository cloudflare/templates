import { env } from "cloudflare:workers";

/**
 * Cloudflare "Vertical Microfrontend" Router
 * 
 * A production-ready router that enables vertical microfrontend architecture by routing
 * requests to separate Worker services based on configurable path expressions, while
 * handling all URL rewriting needed to make multiple apps appear as a unified application.
 * 
 * **Core Features:**
 * - Routes requests to service-bindings based on mount expressions (e.g., `/docs`, `/:tenant/app`)
 * - Strips the matched mount prefix before proxying upstream (so upstream services don't need mount awareness)
 * - Rewrites HTML/CSS asset URLs so absolute paths like `/assets/...` become `${mount}/assets/...`
 * - Rewrites redirects (Location headers) to maintain proper paths within mounted microfrontends
 * - Rewrites cookie Path scoping (Set-Cookie Path=/ -> Path=${mount}/) to prevent collisions
 * - Optional smooth view transitions CSS injection for seamless navigation
 * - Optional preload of static-mount routes with browser-specific optimization:
 *   - Chromium browsers (Chrome, Edge): Uses Speculation Rules API (browser-native prefetching)
 *   - Other browsers (Firefox, Safari): Uses fallback fetch script (`__mf-preload.js`)
 * 
 * **Asset URL Rewriting:**
 * - Rewrites paths matching asset prefixes (defaults: `/assets/`, `/static/`, `/build/`, `/_astro/`, `/fonts/`)
 * - Custom asset prefixes can be added via the ASSET_PREFIXES environment variable (JSON array)
 * - Prefixes are merged with defaults and used for both HTML attribute and CSS url() rewriting
 */

/**
 * Default asset path prefixes that trigger URL rewriting in HTML and CSS.
 * 
 * These defaults are always included. Additional custom prefixes can be added
 * via the ASSET_PREFIXES environment variable (JSON array of strings).
 */
const DEFAULT_ASSET_PREFIXES = ["/assets/", "/static/", "/build/", "/_astro/", "/_next", "/fonts/"];

/**
 * Builds the complete list of asset prefixes by merging defaults with custom prefixes from environment.
 * 
 * Reads the ASSET_PREFIXES environment variable (optional JSON array) and merges it with
 * the default prefixes. Duplicates are removed, and all prefixes are normalized to start with "/" and end with "/".
 * 
 * @param envObj - Environment object containing ASSET_PREFIXES variable
 * @returns Array of normalized asset prefixes
 */
function buildAssetPrefixes(envObj: typeof env = env): string[] {
  const defaults = [...DEFAULT_ASSET_PREFIXES];
  
  // Read custom prefixes from environment variable (optional)
  if ("ASSET_PREFIXES" in envObj && typeof (envObj as any).ASSET_PREFIXES === "string") {
    try {
      const custom = JSON.parse((envObj as any).ASSET_PREFIXES);
      if (Array.isArray(custom)) {
        // Normalize custom prefixes: ensure they start and end with "/"
        const normalized = custom
          .filter((p): p is string => typeof p === "string" && p.trim() !== "")
          .map((p) => {
            let normalized = p.trim();
            if (!normalized.startsWith("/")) normalized = "/" + normalized;
            if (!normalized.endsWith("/")) normalized = normalized + "/";
            return normalized;
          });
        // Merge with defaults and remove duplicates
        const all = [...defaults, ...normalized];
        return [...new Set(all)]; // Remove duplicates using Set
      }
    } catch (e) {
      // If parsing fails, just use defaults (don't throw - fail gracefully)
      console.warn(`Failed to parse ASSET_PREFIXES environment variable: ${e instanceof Error ? e.message : String(e)}. Using defaults only.`);
    }
  }
  
  return defaults;
}

/**
 * Route configuration for a single microfrontend mount point.
 * 
 * @property binding - Service binding name (must match a binding in wrangler.jsonc)
 * @property path - Path expression (e.g., "/docs", "/:tenant/dashboard", "/prefix/:path*")
 * @property preload - If true, preloads this route after DOM loads. Only works for static mounts (no params).
 */
type RouteConfig = {
  binding: string;
  path: string;
  preload?: boolean;
};

/**
 * Complete routing configuration.
 * 
 * Can be provided as a simple array of RouteConfig (legacy format) or as an object
 * with optional global settings and routes array.
 * 
 * @property smoothTransitions - If true, injects CSS for smooth view transitions (applies to all routes)
 * @property routes - Array of route configurations
 */
type RoutesConfig = {
  smoothTransitions?: boolean;
  routes: RouteConfig[];
};

/**
 * Compiled route representation after processing RouteConfig.
 * 
 * @property expr - Original path expression from config (for debugging/reporting)
 * @property binding - Fetcher instance for the service binding
 * @property preload - Whether this route should be preloaded (only valid for static mounts)
 * @property re - Regex that matches pathname and captures mount prefix in group 1
 *   - For most routes: ^(<mountPattern>)(?:/.*)?$  (prefix mount)
 *   - For * routes:     ^(<prefix>)(?:/.*)?$       (prefix mount, 0+ segments)
 *   - For + routes:     ^(<prefix>)/.+$            (prefix mount, 1+ segments)
 * @property isStaticMount - True if route has no dynamic parameters (no :params)
 * @property staticMount - The static mount string (only set if isStaticMount is true)
 * @property baseSpecificity - Literal prefix length for deterministic tie-breaking
 */
type CompiledRoute = {
  expr: string;
  binding: Fetcher;
  preload?: boolean;
  re: RegExp;
  isStaticMount: boolean;
  staticMount?: string;
  baseSpecificity: number;
};

/* ----------------------------- utilities ----------------------------- */

/**
 * Checks if a path starts with any of the supported asset prefixes.
 * Used to determine if a URL should be rewritten.
 * 
 * @param path - Path to check
 * @param assetPrefixes - Array of asset prefixes to check against
 * @returns True if path starts with any of the prefixes
 */
function hasAssetPrefix(path: string, assetPrefixes: string[]): boolean {
  return assetPrefixes.some((p) => path.startsWith(p));
}

/**
 * Normalizes a path string to a consistent format:
 * - Ensures it starts with "/"
 * - Removes trailing "/" (except for root "/")
 * 
 * Examples:
 * - "docs" → "/docs"
 * - "/docs/" → "/docs"
 * - "/" → "/"
 */
function normalizePath(path: string): string {
  if (!path.startsWith("/")) path = "/" + path;
  if (path !== "/" && path.endsWith("/")) path = path.slice(0, -1);
  return path;
}

/**
 * Escapes special regex characters in a string so it can be used as a literal
 * in a regular expression.
 */
function escapeRegexLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Removes backslash escaping from path literals.
 * 
 * The path expression syntax allows escaping special characters with backslash
 * for literal paths, e.g., "/\\(a\\)" means literal "/(a)".
 * This function converts "\X" back to literal "X".
 * 
 * Used when processing parameter patterns like :name(a|b) where the pattern
 * content may contain escaped characters that should be treated as literals.
 */
function unescapePathLiterals(s: string): string {
  return s.replace(/\\(.)/g, "$1");
}

/**
 * Converts a single path segment expression into a regex pattern.
 * 
 * Processes one path segment (no '/' characters) and converts it to regex that matches
 * that segment. Handles literals, parameters, parameter constraints, and escaping.
 * 
 * **Supported Features:**
 * - Literal characters: `docs`, `api-v1`
 * - Parameters: `:tenant`, `:id`
 * - Parameter constraints: `:tenant(a|b|c)`, `:id(\\d+)`
 * - Escaped characters: `\\(special\\)` (matches literal "(special)")
 * - Embedded params: `prefix-:id-suffix` (literal prefix, param, literal suffix)
 * 
 * **Parameter Constraints:**
 * - Syntax: `:name(pattern)` where pattern is treated as regex (after unescaping)
 * - Example: `:id(\\d+)` only matches numeric IDs
 * - Example: `:type(html|css|js)` only matches those three values
 * 
 * **Default Behavior:**
 * - Parameters without constraints match any non-slash characters: `[^/]+`
 * - Example: `:id` becomes `([^/]+)`
 * 
 * @param segmentExpr - Single path segment expression (e.g., "docs", ":id", "prefix-:id-suffix", ":type(html|css)")
 * @returns Regex pattern string for matching this segment
 * @throws Error if parameter syntax is invalid or parentheses are unclosed
 */
function segmentToRegex(segmentExpr: string): string {
  let out = "";
  let i = 0;

  while (i < segmentExpr.length) {
    const ch = segmentExpr[i];

    if (ch === "\\") {
      // escaped literal char
      if (i + 1 < segmentExpr.length) {
        out += escapeRegexLiteral(segmentExpr[i + 1]);
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }

    if (ch === ":") {
      // Parse parameter name (alphanumeric + underscore).
      const nameMatch = segmentExpr.slice(i).match(/^:([A-Za-z0-9_]+)/);
      if (!nameMatch) throw new Error(`Invalid param in segment: "${segmentExpr}"`);
      const name = nameMatch[1];
      i += 1 + name.length;

      // Check for optional constraint pattern in parentheses: :name(pattern)
      if (segmentExpr[i] === "(") {
        // Parse nested parentheses with proper depth tracking and escape handling.
        // This allows complex patterns like :id(\\d+) or :type(html|css|js).
        let depth = 0;
        let j = i;
        for (; j < segmentExpr.length; j++) {
          const c = segmentExpr[j];
          // Skip escaped characters (don't count them for depth tracking).
          if (c === "\\" && j + 1 < segmentExpr.length) {
            j++; // skip escaped char
            continue;
          }
          if (c === "(") depth++;
          if (c === ")") {
            depth--;
            if (depth === 0) break; // Found matching closing paren
          }
        }
        if (j >= segmentExpr.length) throw new Error(`Unclosed (...) in segment: "${segmentExpr}"`);
        
        // Extract the pattern content and unescape any backslash-escaped literals.
        const inner = segmentExpr.slice(i + 1, j);
        const innerRegex = unescapePathLiterals(inner);
        // Wrap in capturing group (the pattern itself is used as-is in the regex).
        out += `(${innerRegex})`;
        i = j + 1;
      } else {
        // No constraint pattern: default to matching any non-slash characters (one segment).
        out += "([^/]+)";
      }
      continue;
    }

    // literal char
    out += escapeRegexLiteral(ch);
    i++;
  }

  return out;
}

/**
 * Computes a specificity score for route matching tie-breaking.
 * 
 * Routes with longer literal prefixes are considered more specific.
 * This is used when multiple routes match the same path with the same
 * mount prefix length - the route with the longer literal prefix wins.
 * 
 * @param expr - Path expression to compute specificity for
 * @returns Number of literal characters before the first parameter (":")
 */
function computeBaseSpecificity(expr: string): number {
  // Count literal prefix characters until first ":" (param).
  // This is not perfect, but good enough for deterministic tie-breaking.
  const idx = expr.indexOf(":");
  const prefix = idx === -1 ? expr : expr.slice(0, idx);
  return prefix.length;
}

/**
 * Compiles a path expression into a RegExp pattern for route matching.
 * 
 * The compiled regex captures the matched mount prefix in group 1, allowing the router
 * to extract the actual mount path (including resolved parameters) for URL rewriting.
 * 
 * **Mount Strategy:** Routes use "prefix mounting" - they match the mount prefix and
 * any deeper paths. For example, `/docs` matches `/docs`, `/docs/`, and `/docs/anything/deep`.
 * 
 * **Supported Syntax:**
 * - Static paths: `/docs`, `/dashboard`
 * - Dynamic params: `/:tenant`, `/:tenant/app`
 * - Wildcards: `/api/:path*` (0+ segments), `/app/:path+` (1+ segments)
 * - Parameter constraints: `/:tenant(a|b|c)`, `/:id(\\d+)`
 * - Escaped literals: `/\\(special\\)` (matches literal "/(special)")
 * - Embedded params: `/prefix-:id-suffix`
 * 
 * **Special Cases:**
 * - `:path*` at the end matches 0+ additional segments (e.g., `/api/:path*` matches `/api` and `/api/users/123`)
 * - `:path+` at the end matches 1+ additional segments (e.g., `/app/:path+` matches `/app/users` but NOT `/app`)
 * 
 * @param exprRaw - Path expression string (e.g., "/docs", "/:tenant/app", "/api/:path*")
 * @returns Object containing compiled regex, static mount flag, and optional static mount string
 */
function compilePathExpr(exprRaw: string): { re: RegExp; isStaticMount: boolean; staticMount?: string } {
  const expr = normalizePath(exprRaw.trim());

  // Static mount detection: no params, no parens, no escapes
  const isStaticMount = !expr.includes(":") && !expr.includes("(") && !expr.includes(")") && !expr.includes("\\");

  if (isStaticMount) {
    const mount = expr;
    // Prefix mount: "/app" matches "/app" and "/app/anything"
    const re = new RegExp(`^(${escapeRegexLiteral(mount)})(?:/.*)?$`);
    return { re, isStaticMount: true, staticMount: mount };
  }

  // Parse expression into path segments (split on "/", filter empty strings).
  const parts = expr.split("/").filter(Boolean);

  // Check if the last segment is a wildcard (:name* or :name+).
  // Wildcards must be the last segment and affect how the mount pattern is built.
  const last = parts[parts.length - 1] ?? "";
  const mStarPlus = last.match(/^:([A-Za-z0-9_]+)([*+])$/);

  // Build the mount pattern regex that will capture the mount prefix.
  // For wildcard routes, we exclude the wildcard segment from the captured mount,
  // because the mount to strip is everything before the wildcard.
  // Example: /api/:path* -> mount pattern is /api (not including :path*)
  let mountPattern = "^/";

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    // Stop before the wildcard segment - don't include it in the mount pattern.
    if (mStarPlus && i === parts.length - 1) {
      break;
    }

    // Convert the segment to regex (handles params, constraints, literals, etc.).
    mountPattern += segmentToRegex(part);
    
    // Add "/" separator between segments (but not after the last segment we process).
    if (i < parts.length - 1 && !(mStarPlus && i === parts.length - 2)) {
      mountPattern += "/";
    }
  }

  // Remove trailing "/" if we ended early (when a wildcard segment exists).
  mountPattern = mountPattern.replace(/\/$/, "");

  // Build the full route matcher regex based on the route type.
  if (mStarPlus) {
    const op = mStarPlus[2];
    if (op === "*") {
      // :path* - matches 0+ additional segments after the mount prefix.
      // Matches both the mount prefix itself AND deeper paths.
      // Example: /api/:path* matches /api, /api/users, /api/users/123
      const re = new RegExp(`^(${mountPattern})(?:/.*)?$`);
      return { re, isStaticMount: false };
    } else {
      // :path+ - matches 1+ additional segments after the mount prefix.
      // Does NOT match the mount prefix alone (requires at least one more segment).
      // Example: /app/:path+ matches /app/users, /app/users/123 (but NOT /app)
      const re = new RegExp(`^(${mountPattern})/.+$`);
      return { re, isStaticMount: false };
    }
  } else {
    // Regular prefix-mount route: matches the expression mount and allows optional deeper paths.
    // Example: /docs matches /docs, /docs/, /docs/anything, /docs/anything/deep
    const re = new RegExp(`^(${mountPattern})(?:/.*)?$`);
    return { re, isStaticMount: false };
  }
}

/* ---------------------- HTML rewriting + injection ---------------------- */

/**
 * HTMLRewriter handler that rewrites asset URLs in HTML element attributes.
 * 
 * Processes elements and rewrites absolute paths in various attributes (href, src, etc.)
 * that match asset prefixes, prepending the mount prefix to maintain correct asset resolution.
 * 
 * Special handling:
 * - Root mount ("/") is treated specially - paths are not modified
 * - Only rewrites absolute paths (starting with "/")
 * - Only rewrites paths matching asset prefixes (unless it's a favicon link)
 * - Skips paths already scoped to the mount
 */
class AllAttributesRewriter {
  constructor(
    private mount: string,
    private assetPrefixes: string[]
  ) {
    this.mount = normalizePath(mount);
  }

  /**
   * Prepends the mount prefix to a path, handling root mount ("/") specially.
   * When mount is "/", returns the path unchanged (treating root as no prefix).
   */
  private prependMount(path: string): string {
    return this.mount === "/" ? path : this.mount + path;
  }

  /**
   * Checks if a path is already scoped to the mount prefix.
   * When mount is "/", all absolute paths are considered scoped (no rewriting needed).
   */
  private isScopedToMount(path: string): boolean {
    // When mount is "/", all absolute paths are already at root, so they're "scoped"
    // and don't need rewriting (prependMount would return them unchanged anyway)
    if (this.mount === "/") return true;
    return path.startsWith(this.mount + "/");
  }

  element(el: Element) {
    const tagName = el.tagName?.toLowerCase();

    // Favicon/link icon rewrite even if it doesn't match asset prefixes (always rewrite icons).
    if (tagName === "link") {
      const rel = el.getAttribute("rel")?.toLowerCase();
      const href = el.getAttribute("href");
      if (rel && (rel.includes("icon") || rel.includes("shortcut")) && href) {
        if (href.startsWith("/") && !this.isScopedToMount(href)) {
          el.setAttribute("href", this.prependMount(href));
        }
      }
    }

    const commonAttrs = [
      "href",
      "src",
      "poster",
      "content",
      "action",
      "cite",
      "formaction",
      "manifest",
      "ping",
      "archive",
      "code",
      "codebase",
      "data",
      "url",
      "srcset",

      // data attrs
      "data-src",
      "data-href",
      "data-url",
      "data-srcset",
      "data-background",
      "data-image",
      "data-link",
      "data-poster",
      "data-video",
      "data-audio",

      // framework-ish
      "component-url",
      "astro-component-url",
      "sveltekit-url",
      "renderer-url",

      // misc
      "background",
      "xlink:href",
    ];

    for (const attrName of commonAttrs) {
      const val = el.getAttribute(attrName);
      if (!val) continue;

      // srcset contains multiple URLs
      if (attrName === "srcset") {
        const rewritten = val
          .split(",")
          .map((src) => {
            const trimmed = src.trim();
            const parts = trimmed.split(/\s+/);
            const url = parts[0];

            if (url.startsWith("/") && !this.isScopedToMount(url) && hasAssetPrefix(url, this.assetPrefixes)) {
              return this.prependMount(url) + (parts[1] ? " " + parts[1] : "");
            }
            return trimmed;
          })
          .join(", ");

        if (rewritten !== val) el.setAttribute(attrName, rewritten);
        continue;
      }

      // absolute-only
      if (!val.startsWith("/")) continue;

      // already scoped
      if (this.isScopedToMount(val)) continue;

      // asset-only
      if (!hasAssetPrefix(val, this.assetPrefixes)) continue;

      el.setAttribute(attrName, this.prependMount(val));
    }
  }
}

/**
 * HTMLRewriter handler that injects CSS for smooth view transitions.
 * 
 * Injects CSS into the <head> element to enable browser-native view transitions
 * when navigating between microfrontends. The CSS is only injected once per response.
 */
class SmoothTransitionsInjector {
  private injected = false;

  element(el: Element) {
    if (this.injected) return;
    this.injected = true;

    const css = `@supports (view-transition-name: none) {
  ::view-transition-old(root),
  ::view-transition-new(root) {
    animation-duration: 0.3s;
    animation-timing-function: ease-in-out;
  }
  main { view-transition-name: main-content; }
  nav { view-transition-name: navigation; }
}`;

    el.append(`<style>${css}</style>`, { html: true });
  }
}

/**
 * HTMLRewriter handler that injects speculation rules for prefetching routes.
 * 
 * Injects a <script type="speculationrules"> element into the <head> to enable
 * browser-native prefetching via the Speculation Rules API. This is more efficient
 * than JavaScript-based fetching and respects user preferences.
 * 
 * The script is only injected once per response.
 */
class SpeculationRulesInjector {
  private injected = false;
  private rulesJson: string;

  constructor(preloadMounts: string[]) {
    this.rulesJson = generateSpeculationRules(preloadMounts);
  }

  element(el: Element) {
    if (this.injected) return;
    this.injected = true;

    // Inject speculation rules script into head
    // Note: CSP may need 'inline-speculation-rules' source or hash/nonce
    el.append(`<script type="speculationrules">${this.rulesJson}</script>`, { html: true });
  }
}

/**
 * HTMLRewriter handler that injects a fallback preload script for non-Chromium browsers.
 * 
 * Injects a <script> tag that loads the `__mf-preload.js` script, which uses fetch()
 * to preload routes. This is used as a fallback for browsers that don't support
 * the Speculation Rules API (Firefox, Safari).
 * 
 * The script is only injected once per response, before </body>.
 */
class PreloadScriptInjector {
  private injected = false;
  private scriptPath: string;

  constructor(mountActual: string) {
    // Special handling for root mount to avoid "//__mf-preload.js"
    this.scriptPath = mountActual === "/" ? "/__mf-preload.js" : `${mountActual}/__mf-preload.js`;
  }

  element(el: Element) {
    if (this.injected) return;
    this.injected = true;

    // Inject script tag before closing body tag
    const tag = `<script src="${this.scriptPath}" defer></script>`;
    el.append(tag, { html: true });
  }
}

/* ----------------------- headers / redirects / cookies ----------------------- */

/**
 * Creates a copy of headers with transformation-incompatible headers removed.
 * 
 * Removes headers that become invalid when response body is transformed:
 * - content-length: Body size changes after rewriting
 * - etag: Content changes, so ETag is invalid
 * - content-encoding: Compression is removed when reading body as text
 */
function cloneHeadersForTransform(original: Headers): Headers {
  const headers = new Headers(original);
  headers.delete("content-length");
  headers.delete("etag");
  headers.delete("content-encoding");
  return headers;
}

/**
 * Rewrites redirect Location headers to include the mount prefix.
 * 
 * When an upstream service redirects to an absolute path on the same origin,
 * the path is rewritten to include the mount prefix so the redirect points to
 * the correct path within the mounted microfrontend.
 * 
 * @param location - Original Location header value
 * @param mount - Mount prefix to prepend (e.g., "/docs")
 * @param requestUrl - Original request URL for resolving relative URLs
 * @returns Rewritten Location header value
 */
function rewriteLocation(location: string, mount: string, requestUrl: URL): string {
  mount = normalizePath(mount);
  try {
    const url = new URL(location, requestUrl.origin);

    // Rewrite same-origin absolute-path redirects
    if (url.origin === requestUrl.origin && url.pathname.startsWith("/")) {
      // If mount is "/", don't add prefix (treat as root)
      url.pathname = mount === "/" ? url.pathname : mount + url.pathname;
      return url.toString();
    }
  } catch {
    // ignore invalid URLs
  }
  return location;
}

/**
 * Rewrites Set-Cookie headers to scope cookie paths to the mount prefix.
 * 
 * Cookies with Path=/ are rewritten to Path=/mount/ to prevent cookie collisions
 * between different microfrontends mounted at different paths.
 * 
 * Uses Headers.getSetCookie() which is available in Cloudflare Workers runtime.
 * 
 * @param headers - Headers object containing Set-Cookie headers
 * @param mount - Mount prefix to use for cookie path (e.g., "/docs")
 */
function rewriteSetCookie(headers: Headers, mount: string) {
  mount = normalizePath(mount);

  const getSetCookie = (headers as any).getSetCookie as undefined | (() => string[]);
  if (!getSetCookie) return;

  const cookies = getSetCookie.call(headers);
  if (!cookies || cookies.length === 0) return;

  headers.delete("Set-Cookie");
  for (const cookie of cookies) {
    if (/;\s*Path=\//i.test(cookie)) {
      // If mount is "/", keep Path=/ (root)
      const newPath = mount === "/" ? "/" : `${mount}/`;
      headers.append("Set-Cookie", cookie.replace(/;\s*Path=\//i, `; Path=${newPath}`));
    } else {
      headers.append("Set-Cookie", cookie);
    }
  }
}

/* --------------------------- preload script endpoint --------------------------- */

/**
 * Generates a preload script that fetches specified routes after DOM loads.
 * 
 * This script is served at `${mount}/__mf-preload.js` and is injected into HTML
 * responses as an external script tag. Using an external script is more CSP-friendly
 * than inline JavaScript.
 * 
 * The script preloads routes by making GET requests with same-origin credentials,
 * helping to warm up routes for faster navigation.
 * 
 * **Important:** Preload targets must be static mount roots (no dynamic parameters),
 * otherwise we cannot determine the concrete mount paths to fetch.
 * 
 * @param preloadMounts - Array of mount paths to preload (e.g., ["/app1", "/app2"])
 * @returns Response containing the preload script
 */
function getPreloadScriptResponse(preloadMounts: string[]): Response {
  const json = JSON.stringify(preloadMounts);
  const js =
    `(()=>{const routes=${json};` +
    `const run=()=>{for(const p of routes){fetch(p,{method:"GET",credentials:"same-origin",cache:"default"}).catch(()=>{});}};` +
    `if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",run,{once:true});}else{run();}` +
    `})();`;

  return new Response(js, {
    status: 200,
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}

/* --------------------------- speculation rules --------------------------- */

/**
 * Detects if the browser is Chromium-based (Chrome, Edge, etc.) from User-Agent.
 * 
 * Chromium-based browsers support the Speculation Rules API, while others
 * (Firefox, Safari) do not yet support it and need the fallback fetch script.
 * 
 * @param userAgent - User-Agent header string from the request
 * @returns True if the browser is Chromium-based
 */
function isChromiumBrowser(userAgent: string): boolean {
  // Chromium-based browsers include: Chrome, Edge, Opera, Brave, etc.
  // They typically have "Chrome" in the User-Agent (even Edge does)
  // but not "Firefox" or "Safari" (without Chrome)
  if (!userAgent) return false;
  
  const ua = userAgent.toLowerCase();
  // Check for Chromium indicators
  const hasChrome = ua.includes("chrome");
  const hasEdge = ua.includes("edg/"); // Edge uses "Edg/" not "Edge"
  const hasOpera = ua.includes("opr/");
  const hasBrave = ua.includes("brave");
  
  // Exclude Firefox and Safari (which don't support Speculation Rules yet)
  const isFirefox = ua.includes("firefox");
  const isSafari = ua.includes("safari") && !ua.includes("chrome");
  
  return (hasChrome || hasEdge || hasOpera || hasBrave) && !isFirefox && !isSafari;
}

/**
 * Generates speculation rules JSON for prefetching routes.
 * 
 * Uses the Speculation Rules API to enable browser-native prefetching of routes.
 * This is more efficient than JavaScript-based fetching as it:
 * - Respects user preferences (battery saver, data saver)
 * - Works for cross-site navigations (with proper configuration)
 * - Doesn't get blocked by Cache-Control headers
 * - Automatically manages priority
 * - Stores prefetched resources in a per-document in-memory cache
 * 
 * For same-origin routes (which is the case for all microfrontend routes),
 * we use simple prefetch rules without cross-origin requirements.
 * 
 * @param preloadMounts - Array of mount paths to prefetch (e.g., ["/app1", "/app2"])
 * @returns JSON string containing speculation rules
 */
function generateSpeculationRules(preloadMounts: string[]): string {
  const rules = {
    prefetch: [
      {
        urls: preloadMounts,
        // For same-origin routes, we don't need requires or referrer_policy
        // The browser will use same-origin credentials automatically
      },
    ],
  };
  return JSON.stringify(rules);
}

/* ------------------------------ main proxy handler ------------------------------ */

/**
 * Handles a request for a mounted microfrontend.
 * 
 * This is the core request processing function that:
 * 1. Strips the mount prefix from the request path before forwarding upstream
 * 2. Transforms the response (HTML/CSS rewriting, redirect/cookie handling)
 * 3. Optionally injects speculation rules and view transition CSS
 * 
 * @param request - Original incoming request
 * @param upstream - Fetcher for the service binding (upstream microfrontend)
 * @param mountActual - The concrete matched mount path (e.g., "/docs" or "/acme" for "/:tenant")
 * @param assetPrefixes - Array of asset prefixes to use for URL rewriting
 * @param options - Optional configuration for response transformation
 * @returns Transformed response
 */
async function handleMountedApp(
  request: Request,
  upstream: Fetcher,
  mountActual: string,
  assetPrefixes: string[],
  options?: {
    smoothTransitions?: boolean;
    preloadStaticMounts?: string[];
  }
): Promise<Response> {
  mountActual = normalizePath(mountActual);

  const forwardUrl = new URL(request.url);

  // Strip the matched mount prefix from the path before forwarding to upstream.
  // The upstream service expects paths relative to its mount point.
  // Example: /docs/about -> /about (when mount is /docs)
  // If mount is "/" (root), pass path through as-is without stripping.
  if (mountActual !== "/") {
    if (forwardUrl.pathname === mountActual) {
      forwardUrl.pathname = "/";
    } else if (forwardUrl.pathname.startsWith(mountActual + "/")) {
      forwardUrl.pathname = forwardUrl.pathname.slice(mountActual.length) || "/";
    }
  }

  const upstreamResp = await upstream.fetch(new Request(forwardUrl.toString(), request));
  const headers = new Headers(upstreamResp.headers);
  const contentType = headers.get("content-type") || "";

  // Redirects: rewrite Location + cookies and return
  if (upstreamResp.status >= 300 && upstreamResp.status < 400) {
    const loc = headers.get("location");
    if (loc) headers.set("location", rewriteLocation(loc, mountActual, new URL(request.url)));
    rewriteSetCookie(headers, mountActual);

    return new Response(null, { status: upstreamResp.status, headers });
  }

  // Serve preload script from the router itself (not from upstream service).
  // This script is used as a fallback for browsers that don't support Speculation Rules API.
  if (
    options?.preloadStaticMounts?.length &&
    forwardUrl.pathname === "/__mf-preload.js"
  ) {
    return getPreloadScriptResponse(options.preloadStaticMounts);
  }

  // HTML rewriting: Rewrite asset URLs in attributes and optionally inject CSS/scripts.
  if (contentType.includes("text/html")) {
    const htmlText = await upstreamResp.text();

    const headersOut = cloneHeadersForTransform(headers);
    rewriteSetCookie(headersOut, mountActual);

    // Detect browser type from User-Agent to determine which preload method to use
    const userAgent = request.headers.get("user-agent") || "";
    const isChromium = isChromiumBrowser(userAgent);

    // Use HTMLRewriter to transform asset URLs in all element attributes.
    const rewriter = new HTMLRewriter().on("*", new AllAttributesRewriter(mountActual, assetPrefixes));
    // Optionally inject view transition CSS into <head>.
    if (options?.smoothTransitions) rewriter.on("head", new SmoothTransitionsInjector());
    
    // Conditionally inject preload mechanism based on browser support:
    // - Chromium browsers: Use Speculation Rules API (more efficient)
    // - Other browsers: Use fallback fetch script (Firefox, Safari)
    if (options?.preloadStaticMounts?.length) {
      if (isChromium) {
        // Inject speculation rules for Chromium browsers (Chrome, Edge, etc.)
        rewriter.on("head", new SpeculationRulesInjector(options.preloadStaticMounts));
      } else {
        // Inject fallback script for non-Chromium browsers (Firefox, Safari)
        rewriter.on("body", new PreloadScriptInjector(mountActual));
      }
    }

    return rewriter.transform(
      new Response(htmlText, {
        status: upstreamResp.status,
        statusText: upstreamResp.statusText,
        headers: headersOut,
      })
    );
  }

  // CSS rewriting: Rewrite url() references to asset paths.
  // Dynamically builds regex from asset prefixes to find url() declarations with absolute asset paths.
  if (contentType.includes("text/css")) {
    const cssText = await upstreamResp.text();
    const headersOut = cloneHeadersForTransform(headers);
    rewriteSetCookie(headersOut, mountActual);

    // Special handling for root mount: don't add prefix.
    const cssMountPrefix = mountActual === "/" ? "" : mountActual;
    
    // Build regex pattern from asset prefixes (escape special regex chars, join with |).
    // Example: /assets/|/static/|/build/ becomes (?:/assets/|/static/|/build/)
    const prefixPattern = assetPrefixes
      .map((p) => p.slice(1, -1)) // Remove leading "/" and trailing "/" for regex
      .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) // Escape regex special chars
      .join("|");
    const regex = new RegExp(`url\\(\\s*(['"]?)(/(?:${prefixPattern})/)`, "g");
    
    // Match: url('...'), url("..."), or url(...) with absolute asset paths.
    const rewrittenCss = cssText.replace(regex, `url($1${cssMountPrefix}$2`);

    return new Response(rewrittenCss, {
      status: upstreamResp.status,
      statusText: upstreamResp.statusText,
      headers: headersOut,
    });
  }

  // Passthrough for all other content types (JSON, images, fonts, etc.).
  // Only rewrite cookies - don't modify the body.
  rewriteSetCookie(headers, mountActual);
  return new Response(upstreamResp.body, {
    status: upstreamResp.status,
    statusText: upstreamResp.statusText,
    headers,
  });
}

/* ------------------------------- config builder ------------------------------- */

/**
 * Parses and compiles route configuration from environment variables.
 * 
 * Reads the ROUTES environment variable (JSON string) and:
 * 1. Parses the JSON configuration
 * 2. Resolves service bindings from the environment
 * 3. Compiles path expressions into regex patterns
 * 4. Sorts routes by specificity for deterministic matching
 * 
 * @param envObj - Environment object (defaults to global env)
 * @returns Compiled routes and global options
 * @throws Error if ROUTES is missing, invalid JSON, or bindings are not found
 */
function buildRoutes(envObj: typeof env = env): {
  routes: CompiledRoute[];
  smoothTransitions?: boolean;
} {
  if (!("ROUTES" in envObj) || typeof (envObj as any).ROUTES !== "string") {
    throw new Error(
      'ROUTES environment variable is required. Define it as a JSON array or object with routes property.'
    );
  }

  let parsed: any;
  try {
    parsed = JSON.parse((envObj as any).ROUTES);
  } catch (e) {
    throw new Error(
      `Failed to parse ROUTES environment variable: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  const smoothTransitions: boolean | undefined =
    parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed.smoothTransitions : undefined;

  const routeDefs: RouteConfig[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.routes)
      ? parsed.routes
      : [];

  if (!routeDefs.length) {
    throw new Error("ROUTES must contain at least one route definition.");
  }

  const compiled: CompiledRoute[] = [];

  for (const r of routeDefs) {
    if (!r.binding || !r.path) {
      throw new Error(`Invalid route configuration: ${JSON.stringify(r)}`);
    }

    const binding = (envObj as any)[r.binding];
    if (!binding || typeof binding.fetch !== "function") {
      throw new Error(`Binding "${r.binding}" not found or is not a valid service binding.`);
    }

    const expr = normalizePath(r.path);
    const { re, isStaticMount, staticMount } = compilePathExpr(expr);

    compiled.push({
      expr,
      binding: binding as Fetcher,
      preload: r.preload,
      re,
      isStaticMount,
      staticMount,
      baseSpecificity: computeBaseSpecificity(expr),
    });
  }

  // Sort routes deterministically by specificity (for consistent ordering in logs/debugging).
  // Runtime matching still uses score-based selection (longest mount prefix wins).
  compiled.sort((a, b) => {
    if (b.baseSpecificity !== a.baseSpecificity) return b.baseSpecificity - a.baseSpecificity;
    return b.expr.length - a.expr.length;
  });

  return { routes: compiled, smoothTransitions };
}

/* --------------------------------- fetch --------------------------------- */

/**
 * Main Cloudflare Workers export.
 * 
 * This is the entry point for all requests. It:
 * 1. Parses the request URL
 * 2. Builds/compiles route configuration
 * 3. Finds the best matching route using regex matching and scoring
 * 4. Delegates to handleMountedApp for request processing
 * 
 * Route matching algorithm:
 * - Tests each route's regex against the request pathname
 * - Selects the route with the highest score:
 *   - Primary: longest matched mount prefix (most specific)
 *   - Secondary: base specificity (literal prefix length)
 *   - Tertiary: expression length (for final tie-breaking)
 * - Falls back to root route ("/") for unmatched asset requests
 */
export default {
  async fetch(request: Request, envParam?: typeof env): Promise<Response> {
    const envObj = envParam || env;
    const url = new URL(request.url);

    const { routes, smoothTransitions } = buildRoutes(envObj);

    // Find best matching route using scoring algorithm.
    let best:
      | {
          route: CompiledRoute;
          mountActual: string;
          score: number;
        }
      | null = null;

    let rootRoute: CompiledRoute | null = null;

    for (const route of routes) {
      // Track the "/" route for fallback handling of unmatched asset requests.
      if (route.staticMount === "/" || route.expr === "/") {
        rootRoute = route;
      }

      const m = route.re.exec(url.pathname);
      if (!m) continue;

      const mountActual = normalizePath(m[1]);

      // Scoring: longest mount prefix is most important (multiplier 1M),
      // then specificity (multiplier 1K), then expression length.
      const score = mountActual.length * 1000000 + route.baseSpecificity * 1000 + route.expr.length;

      if (!best || score > best.score) {
        best = { route, mountActual, score };
      }
    }

    // Build asset prefixes from environment (includes defaults + any custom prefixes).
    const assetPrefixes = buildAssetPrefixes(envObj);

    // Fallback: If no route matched, use the root route ("/") if it exists.
    // This ensures that paths like /product/workers are handled by the root mount
    // when no more specific route matches. This is especially important when the
    // root route serves a frontend application with its own internal routing.
    if (!best && rootRoute) {
      best = {
        route: rootRoute,
        mountActual: "/",
        score: 0,
      };
    }

    if (!best) return new Response("Not found", { status: 404 });

    // Collect static mounts to preload (excluding the current route).
    // Only static mounts can be preloaded because we need concrete paths.
    const preloadStaticMounts = routes
      .filter((r) => r.preload && r.isStaticMount && r.staticMount && r.staticMount !== best!.mountActual)
      .map((r) => r.staticMount!) // safe due to filter
      .map(normalizePath);

    return handleMountedApp(request, best.route.binding, best.mountActual, assetPrefixes, {
      smoothTransitions,
      preloadStaticMounts: preloadStaticMounts.length ? preloadStaticMounts : undefined,
    });
  },
};