// Minimal, dependency-free HTML for the two public pages and confirmations.
import { EXTRA_FIELDS } from "./fields";

const escAttr = (s: string) =>
	s
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");

// Render developer-defined extra fields (from src/fields.ts) as inputs.
function fieldInputs(): string {
	return EXTRA_FIELDS.map((f) => {
		const ph = escAttr(f.label) + (f.required ? "" : " (optional)");
		return `<input name="${escAttr(f.name)}" type="${f.type || "text"}" placeholder="${ph}" aria-label="${escAttr(f.label)}"${f.required ? " required" : ""}>`;
	}).join("\n       ");
}

const STYLE = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
    font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
    background: #f6f7f9; color: #1a1a1a; padding: 24px; }
  @media (prefers-color-scheme: dark) { body { background: #111; color: #eee; } .card { background: #1b1b1b !important; } }
  .card { width: 100%; max-width: 480px; background: #fff; border-radius: 14px; padding: 28px; }
  h1 { font-size: 20px; margin: 0 0 6px; }
  p { color: #666; font-size: 14px; line-height: 1.5; margin: 0 0 18px; }
  label { display: block; font-size: 13px; font-weight: 600; margin: 14px 0 6px; }
  input, textarea { width: 100%; padding: 10px 12px; font: inherit; font-size: 14px;
    border: 1px solid #ccc; border-radius: 10px; background: #fff; color: #111; }
  textarea { min-height: 220px; font-family: ui-monospace, monospace; }
  button { margin-top: 16px; padding: 11px 18px; font-size: 14px; font-weight: 600;
    border: 0; border-radius: 10px; background: #1a1a1a; color: #fff; cursor: pointer; }
  button.secondary { background: #e6e6e6; color: #111; }
  .msg { margin-top: 14px; font-size: 14px; font-weight: 600; }
  .row { display: flex; gap: 10px; flex-wrap: wrap; }
  input:focus, textarea:focus { outline: none; border-color: #1a1a1a;
    box-shadow: 0 0 0 3px rgba(26, 26, 26, 0.10); }
  /* Evenly spaced vertical form (signup) */
  form.stack { display: flex; flex-direction: column; gap: 12px; }
  form.stack button { margin-top: 4px; }
  form.stack .msg { margin-top: 0; }
`;

function shell(title: string, inner: string, script = ""): string {
	return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${title}</title><style>${STYLE}</style></head>
<body><main class="card">${inner}</main>${script ? `<script>${script}</script>` : ""}</body></html>`;
}

// Turnstile widget markup + loader, rendered only when a site key is set.
function turnstile(siteKey?: string): string {
	return siteKey
		? `<div class="cf-turnstile" data-sitekey="${siteKey}" style="margin-top:14px"></div>
       <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`
		: "";
}

// Client-side submit handler shared by the hosted and embedded forms.
// Collects every named input (email, name, extra fields, Turnstile token).
const SUBMIT_JS = `document.getElementById('f').addEventListener('submit', async (e) => {
  e.preventDefault();
  const m = document.getElementById('m');
  const body = {};
  e.target.querySelectorAll('[name]').forEach((el) => { if (el.name) body[el.name] = el.value; });
  const r = await fetch('/api/subscribe', { method:'POST',
    headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  m.textContent = r.ok
    ? (j.pending ? "Almost there — check your inbox to confirm." : "Thanks — you're in!")
    : j.error === 'failed_captcha' ? "Please complete the verification."
    : j.error === 'missing_field' ? "Please fill in all required fields."
    : "Please check your email address.";
  if (r.ok && !j.pending) e.target.reset();
});`;

export function signupPage(turnstileSiteKey?: string): string {
	return shell(
		"Subscribe",
		`<h1>Subscribe to the newsletter</h1>
     <p>Get new posts by email. No spam, unsubscribe anytime.</p>
     <form id="f" class="stack">
       <input name="name" type="text" placeholder="Your name (optional)" aria-label="Name">
       <input name="email" type="email" placeholder="you@example.com" required aria-label="Email">
       ${fieldInputs()}
       ${turnstile(turnstileSiteKey)}
       <button>Subscribe</button>
       <div class="msg" id="m"></div>
     </form>`,
		SUBMIT_JS,
	);
}

// Transparent, chrome-free form for embedding on the user's own site
// (via <iframe src="/embed"> or the /embed page). Posts to the same origin.
export function embedPage(turnstileSiteKey?: string): string {
	return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Subscribe</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: transparent;
    font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; }
  form { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
  input { flex: 1 1 180px; padding: 10px 12px; font: inherit; font-size: 14px;
    border: 1px solid #ccc; border-radius: 10px; background: #fff; color: #111; }
  input:focus { outline: none; border-color: #1a1a1a; box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.08); }
  button { padding: 10px 16px; font: inherit; font-size: 14px; font-weight: 600;
    border: 0; border-radius: 10px; background: #1a1a1a; color: #fff; cursor: pointer; }
  .cf-turnstile { flex-basis: 100%; }
  .msg { flex-basis: 100%; font-size: 13px; color: #555; min-height: 1em; }
  @media (prefers-color-scheme: dark) {
    input { background: #1b1b1b; color: #eee; border-color: #444; }
    input:focus { border-color: #eee; box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.15); }
    button { background: #eee; color: #111; } .msg { color: #aaa; }
  }
</style></head>
<body>
  <form id="f">
    <input name="name" type="text" placeholder="Your name (optional)" aria-label="Name">
    <input name="email" type="email" placeholder="you@example.com" required aria-label="Email">
    ${fieldInputs()}
    ${turnstile(turnstileSiteKey)}
    <button>Subscribe</button>
    <div class="msg" id="m"></div>
  </form>
  <script>${SUBMIT_JS}</script>
</body></html>`;
}

export function adminPage(): string {
	return shell(
		"Send campaign",
		`<h1>Send a campaign</h1>
     <p>Paste your email HTML, send a test to yourself, then send to everyone.
        Merge tags: <code>{{unsubscribe_url}}</code>, <code>{{email}}</code>, <code>{{name}}</code>.</p>
     <form id="f">
       <label>Admin token</label>
       <input id="token" type="password" placeholder="your ADMIN_TOKEN" required>
       <label>Subject</label>
       <input id="subject" type="text" placeholder="This week's newsletter" required>
       <label>HTML</label>
       <textarea id="html" placeholder="<h1>Hello</h1> ... &lt;a href='{{unsubscribe_url}}'&gt;Unsubscribe&lt;/a&gt;"></textarea>
       <label>Test address</label>
       <input id="test" type="email" placeholder="you@example.com">
       <div class="row">
         <button type="button" class="secondary" onclick="send(true)">Send test</button>
         <button type="button" onclick="send(false)">Send to all</button>
       </div>
       <div class="msg" id="m"></div>
     </form>`,
		`async function send(test) {
       const m = document.getElementById('m'); m.textContent = 'Sending…';
       const body = { subject: subject.value, html: html.value };
       if (test) body.testEmail = document.getElementById('test').value;
       const r = await fetch('/api/send', { method:'POST',
         headers:{'Content-Type':'application/json','x-admin-token': token.value}, body: JSON.stringify(body) });
       const j = await r.json().catch(()=>({}));
       m.textContent = !r.ok ? ('Error: ' + (j.error || r.status))
         : test ? 'Test sent.' : ('Done — sent ' + j.sent + ', failed ' + j.failed + '.');
     }`,
	);
}

export function messagePage(title: string, body: string): string {
	return shell(title, `<h1>${title}</h1><p>${body} <a href="/">Home</a></p>`);
}
