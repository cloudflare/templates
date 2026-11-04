import { Hono } from "hono";
import type { Env } from "../types/env";

/**
 * Public, credential-free preview page for the open-source template.
 *
 * Served at GET /preview so a visitor (e.g. a Cloudflare Templates reviewer)
 * can open the deployed workers.dev URL with no Shopify session and understand
 * what the template is. A Shopify *embedded* app renders only inside the
 * Shopify Admin iframe, so it has no standalone public URL. This page makes
 * that explicit and satisfies the CONTRIBUTING "publicly-accessible deployed
 * preview" requirement.
 *
 * It is a self-contained document (inline CSS, one small inline script for the
 * live status strip, no external assets). The path is outside /api/*, so
 * `requireShop` never runs against it.
 */
export const previewRoutes = new Hono<{ Bindings: Env }>();

const REPO_URL = "https://github.com/devkindhq/shopify-on-cloudflare";
const DEPLOY_URL = `https://deploy.workers.cloudflare.com/?url=${REPO_URL}`;
const DEVKIND_URL = "https://devkind.com.au";
const WORKERS_DOCS_URL = "https://developers.cloudflare.com/workers/";
const SHOPIFY_DOCS_URL = "https://shopify.dev/docs/apps/build";

const FAVICON =
	"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%2314161a'/%3E%3Ccircle cx='13' cy='16' r='6.5' fill='%23f6821f'/%3E%3Ccircle cx='20' cy='16' r='6.5' fill='%235e8e3e' fill-opacity='0.88'/%3E%3C/svg%3E";

const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Shopify on Cloudflare: open-source embedded-app starter template</title>
  <meta name="description" content="Open-source starter for Shopify embedded apps on Cloudflare Workers with session-token auth, Hono, Drizzle on D1, KV sessions, R2 storage, and React + Polaris. Runs at the edge with zero cold starts." />
  <link rel="icon" href="${FAVICON}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="Shopify on Cloudflare: open-source embedded-app starter" />
  <meta property="og:description" content="Production-ready Shopify embedded-app starter on Cloudflare Workers: Hono, D1, KV, R2, React + Polaris, session-token auth." />
  <meta property="og:url" content="${REPO_URL}" />
  <meta name="twitter:card" content="summary_large_image" />
  <style>
    :root {
      --ink: #14161a; --muted: #626871; --faint: #8b9099;
      --bg: #f7f7f5; --surface: #ffffff; --line: #e7e7e3;
      --cf: #f6821f; --cf-deep: #cf6c12; --shopify: #5e8e3e;
      --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
      --wrap: 1000px;
    }
    * { box-sizing: border-box; }
    html { -webkit-text-size-adjust: 100%; }
    body {
      margin: 0; background: var(--bg); color: var(--ink); font-family: var(--sans);
      line-height: 1.6; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
    }
    a { color: var(--cf-deep); text-decoration: none; }
    a:hover { text-decoration: underline; }
    :focus-visible { outline: 2px solid var(--cf); outline-offset: 2px; border-radius: 4px; }
    .wrap { max-width: var(--wrap); margin: 0 auto; padding: 0 24px; }
    .mono { font-family: var(--mono); }
    .eyebrow {
      font-family: var(--mono); font-size: .72rem; letter-spacing: .16em; text-transform: uppercase;
      color: var(--faint); margin: 0 0 16px; display: flex; align-items: center; gap: 10px;
    }
    .eyebrow::before { content: ""; width: 22px; height: 2px; background: var(--cf); display: inline-block; }

    /* ---- Hero ---- */
    .hero {
      background: radial-gradient(1200px 460px at 12% -20%, #24272c 0%, var(--ink) 58%);
      color: #fff; padding: 74px 0 66px;
    }
    .hero-grid { display: grid; grid-template-columns: 1.1fr .9fr; gap: 52px; align-items: center; }
    .hero .eyebrow { color: #9aa0a8; }
    .hero h1 {
      margin: 0; font-size: clamp(2.3rem, 5.4vw, 3.4rem); font-weight: 750;
      letter-spacing: -0.035em; line-height: 1.04;
    }
    .hero h1 .sh { color: #9bcf6a; } .hero h1 .cf { color: var(--cf); }
    .lede { margin: 20px 0 0; max-width: 54ch; color: #c7cbd1; font-size: 1.1rem; }
    .lede b { color: #fff; font-weight: 600; }
    .cta { margin-top: 30px; display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
    .btn {
      display: inline-flex; align-items: center; gap: 8px; padding: 11px 18px; border-radius: 9px;
      font-weight: 600; font-size: .94rem; border: 1px solid transparent; cursor: pointer; transition: transform .08s ease;
    }
    .btn:hover { text-decoration: none; transform: translateY(-1px); }
    .btn.primary { background: var(--cf); color: #1a1204; border-color: var(--cf); }
    .btn.ghost { background: transparent; color: #f2f3f5; border-color: #3a3d43; }
    .btn.ghost:hover { border-color: #575b62; }
    .hero-links { margin-top: 18px; font-family: var(--mono); font-size: .82rem; color: #8b9099; }
    .hero-links a { color: #b9bdc4; } .hero-links span { color: #4a4d53; padding: 0 8px; }

    /* signature: "embedded in Shopify Admin" frame */
    .embed {
      background: #fff; border-radius: 14px; overflow: hidden;
      box-shadow: 0 34px 70px -34px rgba(0,0,0,.75); border: 1px solid #33363c;
    }
    .embed-bar {
      display: flex; align-items: center; gap: 9px; padding: 12px 15px;
      background: #1a1c20; border-bottom: 1px solid #2a2c31; color: #cdd1d7;
      font-size: .82rem; font-weight: 600;
    }
    .embed-bar .sdot { width: 12px; height: 12px; border-radius: 3px; background: var(--shopify); }
    .embed-bar .url { margin-left: auto; font-family: var(--mono); font-size: .72rem; color: #6c7178; font-weight: 400; }
    .embed-stage { padding: 20px; background: #eef0f2; }
    .embed-tag {
      display: inline-flex; align-items: center; gap: 7px; font-family: var(--mono); font-size: .7rem;
      letter-spacing: .04em; text-transform: uppercase; color: var(--cf-deep);
      background: #fff4e8; border: 1px solid #f4d3ab; padding: 4px 9px; border-radius: 999px; margin-bottom: 14px;
    }
    .embed-tag::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--cf); }
    .embed-app { background: #fff; border: 1px solid #e1e3e6; border-radius: 10px; padding: 16px; }
    .embed-app h4 { margin: 0 0 12px; font-size: .78rem; font-family: var(--mono); color: var(--muted); font-weight: 600; }
    .embed-app .app-card { border: 1px solid #ececee; border-radius: 8px; padding: 13px; }
    .embed-app .app-card .t { font-size: .86rem; font-weight: 600; }
    .embed-app .app-card .bar { height: 8px; border-radius: 5px; background: #eef0f2; margin-top: 10px; }
    .embed-app .app-card .bar.s { width: 62%; } .embed-app .app-card .bar.xs { width: 38%; }

    /* live edge-status strip */
    .term {
      margin-top: 44px; max-width: 560px; background: #0f1013; border: 1px solid #2a2c31;
      border-radius: 12px; overflow: hidden; box-shadow: 0 20px 50px -24px rgba(0,0,0,.7);
    }
    .term-bar { display: flex; align-items: center; gap: 7px; padding: 11px 14px; border-bottom: 1px solid #24262b; background: #17181c; }
    .term-bar .d { width: 11px; height: 11px; border-radius: 50%; background: #34363c; }
    .term-title { font-family: var(--mono); font-size: .74rem; color: #6c7178; margin-left: 8px; }
    .term-body { padding: 14px 16px; font-family: var(--mono); font-size: .86rem; }
    .term-row { display: flex; align-items: baseline; gap: 12px; padding: 4px 0; color: #cfd3d9; }
    .term-row .prompt { color: var(--cf); } .term-row .path { flex: 1; }
    .term-row .res { color: #6c7178; } .term-row .res.ok { color: #56d98a; } .term-row .res.bad { color: #ff8a7a; }

    /* ---- Content ---- */
    main section { padding: 52px 0; border-bottom: 1px solid var(--line); }
    section h2 { margin: 0 0 22px; font-size: 1.35rem; font-weight: 700; letter-spacing: -0.02em; }
    .callout {
      display: grid; grid-template-columns: auto 1fr; gap: 16px; align-items: start;
      background: #fff; border: 1px solid var(--line); border-left: 3px solid var(--shopify);
      border-radius: 10px; padding: 18px 20px;
    }
    .callout .badge {
      font-family: var(--mono); font-size: .68rem; letter-spacing: .06em; text-transform: uppercase;
      color: var(--shopify); border: 1px solid #cfe0c0; background: #eef5e7; border-radius: 6px;
      padding: 5px 8px; white-space: nowrap;
    }
    .callout p { margin: 0; color: #45403a; font-size: .99rem; }
    .callout strong { color: var(--ink); }

    .stack { display: flex; flex-wrap: wrap; gap: 9px; }
    .tech {
      font-family: var(--mono); font-size: .82rem; padding: 7px 13px; border-radius: 8px;
      background: var(--surface); border: 1px solid var(--line); color: #33373d;
    }
    .tech b { font-weight: 600; color: var(--cf-deep); }

    .flow { list-style: none; margin: 0; padding: 0; position: relative; }
    .flow::before { content: ""; position: absolute; left: 7px; top: 8px; bottom: 8px; width: 2px; background: var(--line); }
    .flow li { position: relative; padding: 0 0 22px 34px; }
    .flow li:last-child { padding-bottom: 0; }
    .flow li::before {
      content: ""; position: absolute; left: 0; top: 4px; width: 16px; height: 16px; border-radius: 50%;
      background: var(--surface); border: 2px solid var(--cf);
    }
    .flow .layer { font-family: var(--mono); font-size: .9rem; font-weight: 600; color: var(--ink); }
    .flow .desc { color: var(--muted); font-size: .96rem; margin-top: 2px; }
    .flow .routes { margin: 10px 0 0; padding: 0; list-style: none; display: grid; gap: 6px; }
    .flow .routes code {
      font-family: var(--mono); font-size: .8rem; background: #f0f0ec; border: 1px solid var(--line);
      padding: 2px 7px; border-radius: 6px; color: #33373d;
    }
    .flow .routes .t { color: var(--muted); font-size: .9rem; }

    ul.feat { margin: 0; padding: 0; list-style: none; display: grid; gap: 12px; }
    ul.feat li { padding-left: 26px; position: relative; color: #33373d; }
    ul.feat li::before { content: ""; position: absolute; left: 2px; top: 8px; width: 8px; height: 8px; border-radius: 2px; background: var(--shopify); }
    code { font-family: var(--mono); }
    ul.feat code, ol.steps code { font-size: .85em; background: #f0f0ec; padding: 1px 6px; border-radius: 5px; }

    ol.steps { margin: 0; padding: 0; list-style: none; counter-reset: step; display: grid; gap: 16px; }
    ol.steps li { padding-left: 42px; position: relative; color: #33373d; }
    ol.steps li::before {
      counter-increment: step; content: counter(step); position: absolute; left: 0; top: -1px;
      width: 26px; height: 26px; border-radius: 7px; background: var(--ink); color: #fff;
      font-family: var(--mono); font-size: .82rem; display: grid; place-items: center;
    }

    footer { padding: 34px 0 56px; color: var(--muted); font-size: .9rem; }
    footer .row { display: flex; flex-wrap: wrap; gap: 8px 18px; align-items: center; justify-content: space-between; }
    footer a { color: var(--ink); font-weight: 600; }
    footer .dev::before { content: ""; display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: var(--cf); margin-right: 8px; }

    .reveal { opacity: 0; transform: translateY(10px); animation: rise .6s cubic-bezier(.2,.7,.2,1) forwards; }
    .reveal.d1 { animation-delay: .06s; } .reveal.d2 { animation-delay: .12s; } .reveal.d3 { animation-delay: .18s; }
    @keyframes rise { to { opacity: 1; transform: none; } }

    @media (max-width: 820px) {
      .hero-grid { grid-template-columns: 1fr; gap: 40px; }
      .embed { max-width: 460px; }
    }
    @media (max-width: 560px) {
      .hero { padding: 54px 0 46px; }
      .lede { font-size: 1.02rem; }
      main section { padding: 40px 0; }
      .callout { grid-template-columns: 1fr; }
      footer .row { flex-direction: column; align-items: flex-start; }
    }
    @media (prefers-reduced-motion: reduce) {
      .reveal { animation: none; opacity: 1; transform: none; }
      .btn { transition: none; }
    }
  </style>
</head>
<body>
  <header class="hero">
    <div class="wrap">
      <div class="hero-grid">
        <div>
          <p class="eyebrow reveal">Shopify embedded app · Open-source template</p>
          <h1 class="reveal d1"><span class="sh">Shopify</span> on <span class="cf">Cloudflare</span></h1>
          <p class="lede reveal d2">A production-ready starter for building <b>Shopify embedded apps</b> on Cloudflare Workers, with session-token auth, Hono routing, Drizzle on D1, KV-backed sessions, and R2 storage, plus a React&nbsp;+&nbsp;Polaris frontend. All at the edge, zero cold starts.</p>
          <div class="cta reveal d2">
            <a class="btn primary" href="${REPO_URL}">View on GitHub</a>
            <a class="btn ghost" href="${DEPLOY_URL}">Deploy to Cloudflare</a>
          </div>
          <div class="hero-links reveal d3">
            <a href="${WORKERS_DOCS_URL}">Workers docs</a><span>/</span><a href="${SHOPIFY_DOCS_URL}">Shopify app docs</a>
          </div>
        </div>

        <div class="embed reveal d3" role="img" aria-label="Illustration: the app runs embedded inside the Shopify Admin">
          <div class="embed-bar"><span class="sdot"></span> Shopify Admin <span class="url">/store/apps</span></div>
          <div class="embed-stage">
            <span class="embed-tag">Embedded via App Bridge</span>
            <div class="embed-app">
              <h4>Cloudflare Worker · React + Polaris</h4>
              <div class="app-card">
                <div class="t">Example protected API call</div>
                <div class="bar"></div><div class="bar s"></div><div class="bar xs"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="term reveal d3" role="status" aria-live="polite" aria-label="Live edge status">
        <div class="term-bar"><span class="d"></span><span class="d"></span><span class="d"></span><span class="term-title">edge status · live</span></div>
        <div class="term-body">
          <div class="term-row"><span class="prompt">&gt;</span><span class="path">GET /health</span><span class="res" id="r-health">checking</span></div>
          <div class="term-row"><span class="prompt">&gt;</span><span class="path">GET /api/example</span><span class="res" id="r-api">checking</span></div>
        </div>
      </div>
    </div>
  </header>

  <main class="wrap">
    <section>
      <div class="callout">
        <span class="badge">Embedded app</span>
        <p><strong>This is a preview of an open-source template, not a running store.</strong> Shopify embedded apps render inside the Shopify Admin iframe, so they have no standalone URL of their own. The live app runs inside a merchant's admin. This page shows what the template is and how it's built.</p>
      </div>
    </section>

    <section>
      <p class="eyebrow">The stack</p>
      <h2>Built on the edge</h2>
      <div class="stack">
        <span class="tech"><b>Cloudflare Workers</b></span>
        <span class="tech">Hono</span>
        <span class="tech">D1 <b>+</b> Drizzle ORM</span>
        <span class="tech">KV · sessions</span>
        <span class="tech">R2 · files</span>
        <span class="tech">React 18 · Vite</span>
        <span class="tech">Shopify Polaris</span>
        <span class="tech">App Bridge</span>
      </div>
    </section>

    <section>
      <p class="eyebrow">How it fits together</p>
      <h2>Request flow</h2>
      <ol class="flow">
        <li>
          <div class="layer">Browser · Shopify Admin</div>
          <div class="desc">Loads the embedded app inside an iframe.</div>
        </li>
        <li>
          <div class="layer">App Bridge</div>
          <div class="desc">Mints a short-lived session-token JWT on every request.</div>
        </li>
        <li>
          <div class="layer">Cloudflare Worker · Hono</div>
          <div class="desc">Verifies the JWT, then routes the request:</div>
          <ul class="routes">
            <li><code>/shopify/install</code> <code>/shopify/callback</code> <span class="t">· OAuth install &amp; callback</span></li>
            <li><code>/api/*</code> <span class="t">· guarded by the <code>requireShop</code> middleware</span></li>
            <li><code>/*</code> <span class="t">· React + Polaris SPA (static assets)</span></li>
          </ul>
        </li>
        <li>
          <div class="layer">D1 · KV · R2</div>
          <div class="desc">Shop data, Shopify sessions, and file storage, all at the edge.</div>
        </li>
      </ol>
    </section>

    <section>
      <p class="eyebrow">What's included</p>
      <h2>Wired up out of the box</h2>
      <ul class="feat">
        <li>Shopify OAuth + session-token auth. Every <code>/api/*</code> route is protected by middleware</li>
        <li>KV-backed Shopify session storage</li>
        <li>D1 + Drizzle with a single <code>shopify_shop</code> table to extend</li>
        <li>Install / uninstall lifecycle, including the <code>app/uninstalled</code> webhook</li>
        <li>An example protected route (<code>GET /api/example</code>) and a Polaris page that calls it</li>
      </ul>
    </section>

    <section>
      <p class="eyebrow">Get started</p>
      <h2>Three steps to running</h2>
      <ol class="steps">
        <li>Clone the repo and run <code>npm install</code>.</li>
        <li>Create the D1, KV, and R2 resources, then set your Shopify secrets (see the README).</li>
        <li>Run <code>npm run dev</code> locally, or <code>npm run deploy</code> to ship to Cloudflare.</li>
      </ol>
    </section>
  </main>

  <footer class="wrap">
    <div class="row">
      <span class="dev">Built &amp; open-sourced by <a href="${DEVKIND_URL}">Devkind</a></span>
      <span><a href="${REPO_URL}">github.com/devkindhq/shopify-on-cloudflare</a> · MIT</span>
    </div>
  </footer>

  <script>
    (function () {
      function set(id, ok, text) {
        var el = document.getElementById(id);
        if (!el) return;
        el.className = 'res ' + (ok ? 'ok' : 'bad');
        el.textContent = text;
      }
      fetch('/health').then(function (r) {
        return r.json().then(function (j) { return { s: r.status, j: j }; });
      }).then(function (x) {
        var ok = x.s === 200 && x.j && x.j.status === 'ok';
        set('r-health', ok, ok ? '200 ok' : x.s + ' unexpected');
      }).catch(function () { set('r-health', false, 'unavailable'); });
      // The protected route must reject an unauthenticated request with 401.
      fetch('/api/example').then(function (r) {
        set('r-api', r.status === 401, r.status === 401 ? '401 protected' : r.status + ' unexpected');
      }).catch(function () { set('r-api', false, 'unavailable'); });
    }());
  </script>
</body>
</html>`;

previewRoutes.get("/preview", (c) => c.html(PAGE));
