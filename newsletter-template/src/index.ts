import { Hono } from "hono";
import { cors } from "hono/cors";
import { sendEmail, isEmailConfigured } from "./email";
import * as mail from "./email";
import {
	signupPage,
	embedPage,
	adminPage,
	messagePage,
	unsubscribePage,
} from "./html";
import { EXTRA_FIELDS } from "./fields";
import { fetchFeedItems, type FeedItem } from "./rss";

type Bindings = {
	DB: D1Database;
	ADMIN_TOKEN?: string;
	FROM_NAME?: string;
	FROM_EMAIL?: string;
	DOUBLE_OPT_IN?: string;
	TURNSTILE_SITE_KEY?: string;
	TURNSTILE_SECRET_KEY?: string;
	RSS_AUTOSEND?: string;
	RSS_FEED_URL?: string;
	PUBLIC_URL?: string;
	SENDER_ADDRESS?: string;
	PRIVACY_URL?: string;
	SEND_BATCH?: string;
	FOOTER_TEXT?: string;
	UNSUBSCRIBE_LABEL?: string;
	CONFIRM_SUBJECT?: string;
	CONFIRM_HTML?: string;
};

// One outgoing email, ready for delivery.
type OutgoingEmail = {
	to: string;
	subject: string;
	html: string;
	headers: Record<string, string>;
};

// Optional batch hook: when src/email.ts exports sendEmailBatch (one API call,
// many emails — see the commented example there), the queue drain uses it
// instead of one call per recipient. Looked up loosely so a customized
// email.ts from an older version keeps compiling.
const sendEmailBatch = (
	mail as {
		sendEmailBatch?: (env: Bindings, emails: OutgoingEmail[]) => Promise<void>;
	}
).sendEmailBatch;

const app = new Hono<{ Bindings: Bindings }>();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const unsubUrl = (origin: string, token: string) =>
	`${origin}/unsubscribe?t=${encodeURIComponent(token)}`;
const confirmUrl = (origin: string, token: string) =>
	`${origin}/confirm?t=${encodeURIComponent(token)}`;

// RFC 8058 one-click unsubscribe headers, attached to every send. Gmail and
// Yahoo require these for bulk senders; mail clients use them for their
// native "Unsubscribe" button.
const listHeaders = (unsub: string): Record<string, string> => ({
	"List-Unsubscribe": `<${unsub}>`,
	"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
});

const escapeHtml = (s: string) =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Footer appended to every campaign email: why the reader is getting it, a
// working unsubscribe link, and the sender's postal address. The US CAN-SPAM
// Act requires a valid physical address in commercial email, and anti-spam
// laws generally require a clear opt-out in every message. FOOTER_TEXT and
// UNSUBSCRIBE_LABEL localize the wording (defaults are English).
function complianceFooter(env: Bindings, unsub: string): string {
	const address = String(env.SENDER_ADDRESS ?? "").trim();
	const text =
		String(env.FOOTER_TEXT ?? "").trim() ||
		`You're receiving this email because you subscribed to ${env.FROM_NAME || "this newsletter"}.`;
	const label = String(env.UNSUBSCRIBE_LABEL ?? "").trim() || "Unsubscribe";
	return `<hr style="border:none;border-top:1px solid #ddd;margin:28px 0 12px">
    <p style="font-size:12px;line-height:1.6;color:#888">
      ${escapeHtml(text)}
      <a href="${unsub}" style="color:#888">${escapeHtml(label)}</a>${address ? `<br>${escapeHtml(address)}` : ""}
    </p>`;
}

// Wrap outgoing HTML in a minimal document with an explicit charset, unless
// the author already pasted a complete document. Without this, mail clients
// may guess the encoding and garble non-ASCII text (umlauts, accents, …).
function emailDocument(html: string): string {
	if (/<html[\s>]/i.test(html)) return html;
	return `<!doctype html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`;
}

// Fill merge tags in campaign HTML for one recipient.
const applyMergeTags = (
	origin: string,
	html: string,
	token: string,
	email: string,
	name?: string | null,
) =>
	html
		.replaceAll("{{unsubscribe_url}}", unsubUrl(origin, token))
		.replaceAll("{{email}}", email)
		.replaceAll("{{name}}", name || "");

// Store a campaign and queue one outbox row per subscribed address. Delivery
// happens in the background: the minutely cron drains the queue in
// SEND_BATCH-sized runs, which keeps every Worker invocation inside the free
// plan's subrequest limits no matter how large the list is. Shared by the
// admin send endpoint and the RSS auto-send job.
async function enqueueCampaign(
	env: Bindings,
	baseUrl: string,
	subject: string,
	html: string,
): Promise<number> {
	const campaign = await env.DB.prepare(
		`INSERT INTO campaigns (subject, body_html, base_url) VALUES (?1, ?2, ?3) RETURNING id`,
	)
		.bind(subject, html, baseUrl)
		.first<{ id: number }>();
	if (!campaign) return 0;
	const res = await env.DB.prepare(
		`INSERT INTO outbox (campaign_id, email, name, unsub_token)
     SELECT ?1, email, name, unsub_token FROM subscribers WHERE status = 'subscribed'`,
	)
		.bind(campaign.id)
		.run();
	return res.meta.changes ?? 0;
}

// Emails delivered per drain run. The default of 40 fits the free plan's
// ~50 outbound calls per invocation; raise it on the paid plan, or implement
// sendEmailBatch (one call per ~1,000 emails) and raise it a lot.
const sendBatchSize = (env: Bindings) =>
	Math.min(5000, Math.max(1, parseInt(env.SEND_BATCH ?? "", 10) || 40));

type OutboxRow = {
	id: number;
	campaign_id: number;
	email: string;
	name: string | null;
	unsub_token: string;
	attempts: number;
};

const countByCampaign = (rows: OutboxRow[]) => {
	const m = new Map<number, number>();
	for (const r of rows) m.set(r.campaign_id, (m.get(r.campaign_id) ?? 0) + 1);
	return m;
};

// Deliver the next chunk of the queue. Runs every minute on the cron. Rows
// are claimed atomically (pending -> sending), so overlapping runs can never
// double-send; rows stuck in 'sending' (a crashed run) are reclaimed after
// 10 minutes and give up as 'failed' after 3 attempts.
async function drainOutbox(env: Bindings): Promise<void> {
	if (!isEmailConfigured(env)) return;

	// Honor opt-outs that happened after queueing: their pending rows are
	// cancelled, not delivered.
	await env.DB.prepare(
		`DELETE FROM outbox WHERE status = 'pending'
     AND email NOT IN (SELECT email FROM subscribers WHERE status = 'subscribed')`,
	).run();

	const { results: rows } = await env.DB.prepare(
		`UPDATE outbox SET status = 'sending', attempts = attempts + 1, claimed_at = datetime('now')
     WHERE id IN (
       SELECT id FROM outbox
       WHERE (status = 'pending' OR (status = 'sending' AND claimed_at < datetime('now', '-10 minutes')))
         AND attempts < 3
       ORDER BY id LIMIT ?1
     )
     RETURNING id, campaign_id, email, name, unsub_token, attempts`,
	)
		.bind(sendBatchSize(env))
		.all<OutboxRow>();
	if (!rows.length) return;

	// Campaign bodies for this chunk.
	const ids = [...new Set(rows.map((r) => r.campaign_id))];
	const { results: campaigns } = await env.DB.prepare(
		`SELECT id, subject, body_html, base_url FROM campaigns WHERE id IN (${ids.map(() => "?").join(",")})`,
	)
		.bind(...ids)
		.all<{
			id: number;
			subject: string;
			body_html: string | null;
			base_url: string | null;
		}>();
	const campaignById = new Map(campaigns.map((c) => [c.id, c]));

	const build = (r: OutboxRow): OutgoingEmail | null => {
		const c = campaignById.get(r.campaign_id);
		if (!c?.body_html || !c.base_url) return null;
		const unsub = unsubUrl(c.base_url, r.unsub_token);
		return {
			to: r.email,
			subject: c.subject,
			html: emailDocument(
				applyMergeTags(
					c.base_url,
					c.body_html,
					r.unsub_token,
					r.email,
					r.name,
				) + complianceFooter(env, unsub),
			),
			headers: listHeaders(unsub),
		};
	};

	const sent: OutboxRow[] = [];
	const failed: OutboxRow[] = [];
	const deliverable: { row: OutboxRow; msg: OutgoingEmail }[] = [];
	for (const row of rows) {
		const msg = build(row);
		if (msg) deliverable.push({ row, msg });
		else failed.push(row);
	}

	const sendIndividually = async (
		list: { row: OutboxRow; msg: OutgoingEmail }[],
	) => {
		for (const d of list) {
			try {
				await sendEmail(env, d.msg);
				sent.push(d.row);
			} catch (err) {
				console.error(`sendEmail to ${d.msg.to} failed:`, err);
				failed.push(d.row);
			}
		}
	};

	if (sendEmailBatch && deliverable.length) {
		// One API call (or a few, chunked in the adapter) for the whole run. If
		// the batch call fails, fall back to per-email delivery so a broken batch
		// adapter degrades to slower sends instead of burning retry attempts.
		try {
			await sendEmailBatch(
				env,
				deliverable.map((d) => d.msg),
			);
			sent.push(...deliverable.map((d) => d.row));
		} catch (err) {
			console.error(
				"sendEmailBatch failed, falling back to per-email delivery:",
				err,
			);
			await sendIndividually(deliverable);
		}
	} else {
		await sendIndividually(deliverable);
	}

	// Book results: successes leave the queue and count on the campaign;
	// failures retry next run, or stick as 'failed' on the third attempt.
	const stmts: D1PreparedStatement[] = [];
	if (sent.length) {
		stmts.push(
			env.DB.prepare(
				`DELETE FROM outbox WHERE id IN (${sent.map(() => "?").join(",")})`,
			).bind(...sent.map((r) => r.id)),
		);
		for (const [cid, n] of countByCampaign(sent)) {
			stmts.push(
				env.DB.prepare(
					`UPDATE campaigns SET sent_count = sent_count + ?2 WHERE id = ?1`,
				).bind(cid, n),
			);
		}
	}
	const retry = failed.filter((r) => r.attempts < 3);
	const gaveUp = failed.filter((r) => r.attempts >= 3);
	if (retry.length) {
		stmts.push(
			env.DB.prepare(
				`UPDATE outbox SET status = 'pending' WHERE id IN (${retry.map(() => "?").join(",")})`,
			).bind(...retry.map((r) => r.id)),
		);
	}
	if (gaveUp.length) {
		stmts.push(
			env.DB.prepare(
				`UPDATE outbox SET status = 'failed' WHERE id IN (${gaveUp.map(() => "?").join(",")})`,
			).bind(...gaveUp.map((r) => r.id)),
		);
		for (const [cid, n] of countByCampaign(gaveUp)) {
			stmts.push(
				env.DB.prepare(
					`UPDATE campaigns SET fail_count = fail_count + ?2 WHERE id = ?1`,
				).bind(cid, n),
			);
		}
	}
	if (stmts.length) await env.DB.batch(stmts);
}

// Verify a Cloudflare Turnstile token server-side. Only enforced when a secret
// is configured; otherwise signups pass through (feature is opt-in).
async function turnstileOk(
	secret: string,
	token: string,
	ip?: string,
): Promise<boolean> {
	const form = new FormData();
	form.append("secret", secret);
	form.append("response", token);
	if (ip) form.append("remoteip", ip);
	const res = await fetch(
		"https://challenges.cloudflare.com/turnstile/v0/siteverify",
		{
			method: "POST",
			body: form,
		},
	).catch(() => null);
	if (!res) return false;
	const data = (await res.json().catch(() => ({}))) as { success?: boolean };
	return data.success === true;
}

// Confirmation email for double opt-in. CONFIRM_SUBJECT and CONFIRM_HTML
// (with a {{confirm_url}} merge tag) localize it; defaults are English.
const confirmSubject = (env: Bindings) =>
	String(env.CONFIRM_SUBJECT ?? "").trim() ||
	"Please confirm your subscription";

function confirmEmailHtml(env: Bindings, link: string): string {
	const custom = String(env.CONFIRM_HTML ?? "").trim();
	if (custom) return custom.replaceAll("{{confirm_url}}", link);
	return `<p>Please confirm your subscription by clicking the link below:</p>
   <p><a href="${link}">Confirm my subscription</a></p>
   <p>If you didn't request this, you can ignore this email.</p>`;
}

// Read JSON or form-encoded bodies transparently.
async function readParams(c: any): Promise<Record<string, string>> {
	const ct = c.req.header("content-type") || "";
	const raw = ct.includes("application/json")
		? await c.req.json().catch(() => ({}))
		: await c.req.parseBody().catch(() => ({}));
	return raw as Record<string, string>;
}

// --- Public: hosted signup form ---
app.get("/", (c) =>
	c.html(signupPage(c.env.TURNSTILE_SITE_KEY, c.env.PRIVACY_URL)),
);

// --- Public: bare form for iframe/script embedding on your own site ---
app.get("/embed", (c) =>
	c.html(embedPage(c.env.TURNSTILE_SITE_KEY, c.env.PRIVACY_URL)),
);

// Allow the subscribe endpoint to be called from your own website's domain.
app.use("/api/subscribe", cors());

// --- Public: subscribe (single or double opt-in, per DOUBLE_OPT_IN) ---
app.post("/api/subscribe", async (c) => {
	const p = await readParams(c);
	const email = String(p.email ?? "")
		.trim()
		.toLowerCase();
	const name = String(p.name ?? "")
		.trim()
		.slice(0, 100);
	if (!EMAIL_RE.test(email) || email.length > 254) {
		return c.json({ ok: false, error: "invalid_email" }, 400);
	}

	// Collect any developer-defined extra fields (stored as JSON in `data`).
	const extra: Record<string, string> = {};
	for (const f of EXTRA_FIELDS) {
		const v = String(p[f.name] ?? "")
			.trim()
			.slice(0, 500);
		if (f.required && !v)
			return c.json({ ok: false, error: "missing_field", field: f.name }, 400);
		if (v) extra[f.name] = v;
	}
	const dataJson = Object.keys(extra).length ? JSON.stringify(extra) : null;

	// Bot protection (only when Turnstile is configured).
	if (c.env.TURNSTILE_SECRET_KEY) {
		const token = String(p["cf-turnstile-response"] ?? p.token ?? "");
		const ok = await turnstileOk(
			c.env.TURNSTILE_SECRET_KEY,
			token,
			c.req.header("CF-Connecting-IP"),
		);
		if (!ok) return c.json({ ok: false, error: "failed_captcha" }, 400);
	}

	const doubleOptIn =
		String(c.env.DOUBLE_OPT_IN ?? "").toLowerCase() === "true";

	if (doubleOptIn) {
		// Double opt-in needs email configured to send the confirmation link.
		if (!isEmailConfigured(c.env)) {
			return c.json({ ok: false, error: "email_not_configured" }, 400);
		}
		// Insert as pending; never downgrade an already-subscribed address.
		const row = await c.env.DB.prepare(
			`INSERT INTO subscribers (email, name, status, unsub_token, confirm_token, data)
       VALUES (?1, ?2, 'pending', ?3, ?4, ?5)
       ON CONFLICT(email) DO UPDATE SET
         name = COALESCE(excluded.name, subscribers.name),
         data = COALESCE(excluded.data, subscribers.data),
         status = CASE WHEN subscribers.status = 'subscribed' THEN 'subscribed' ELSE 'pending' END,
         confirm_token = CASE WHEN subscribers.status = 'subscribed' THEN subscribers.confirm_token ELSE excluded.confirm_token END
       RETURNING status, confirm_token, unsub_token`,
		)
			.bind(
				email,
				name || null,
				crypto.randomUUID(),
				crypto.randomUUID(),
				dataJson,
			)
			.first<{
				status: string;
				confirm_token: string | null;
				unsub_token: string;
			}>();

		// Already subscribed -> nothing to confirm.
		if (row?.status !== "pending" || !row.confirm_token)
			return c.json({ ok: true });

		const origin = new URL(c.req.url).origin;
		try {
			await sendEmail(c.env, {
				to: email,
				subject: confirmSubject(c.env),
				html: emailDocument(
					confirmEmailHtml(c.env, confirmUrl(origin, row.confirm_token)),
				),
				headers: listHeaders(unsubUrl(origin, row.unsub_token)),
			});
		} catch {
			return c.json({ ok: false, error: "confirmation_send_failed" }, 502);
		}
		return c.json({ ok: true, pending: true });
	}

	// Single opt-in: active immediately.
	await c.env.DB.prepare(
		`INSERT INTO subscribers (email, name, status, unsub_token, data)
     VALUES (?1, ?2, 'subscribed', ?3, ?4)
     ON CONFLICT(email) DO UPDATE SET
       status = 'subscribed',
       name = COALESCE(excluded.name, subscribers.name),
       data = COALESCE(excluded.data, subscribers.data)`,
	)
		.bind(email, name || null, crypto.randomUUID(), dataJson)
		.run();
	return c.json({ ok: true });
});

// --- Public: confirm a double opt-in subscription ---
app.get("/confirm", async (c) => {
	const token = c.req.query("t") || c.req.query("token") || "";
	if (token) {
		await c.env.DB.prepare(
			`UPDATE subscribers SET status = 'subscribed', confirm_token = NULL,
         confirmed_at = datetime('now')
       WHERE confirm_token = ?1 AND status = 'pending'`,
		)
			.bind(token)
			.run();
	}
	return c.html(
		messagePage(
			"You're subscribed!",
			"Thanks for confirming — you're all set.",
		),
	);
});

// --- Public: unsubscribe. GET shows a one-button confirmation page, so mail
// scanners that prefetch every link in an email can't unsubscribe readers by
// accident. POST executes — used by that button and by RFC 8058 one-click
// requests from mail clients. ---
app.get("/unsubscribe", (c) => {
	const token = c.req.query("t") || c.req.query("token") || "";
	if (!token)
		return c.html(
			messagePage("Invalid link", "This unsubscribe link is incomplete."),
		);
	return c.html(unsubscribePage(token));
});

app.post("/unsubscribe", async (c) => {
	const token = c.req.query("t") || c.req.query("token") || "";
	if (token) {
		// Opt out immediately and drop the personal data we no longer need (GDPR
		// data minimization). The address itself stays as the opt-out record.
		await c.env.DB.prepare(
			`UPDATE subscribers SET status = 'unsubscribed', name = NULL, data = NULL,
         confirm_token = NULL, unsubscribed_at = COALESCE(unsubscribed_at, datetime('now'))
       WHERE unsub_token = ?1`,
		)
			.bind(token)
			.run();
	}
	// A page for the human clicking the button; plain text for one-click POSTs.
	return (c.req.header("accept") || "").includes("text/html")
		? c.html(
				messagePage(
					"You've been unsubscribed.",
					"You won't receive further emails.",
				),
			)
		: c.text("unsubscribed");
});

// --- Admin compose page (a form only; sending requires the token below) ---
app.get("/admin", (c) =>
	c.html(adminPage(Boolean(String(c.env.SENDER_ADDRESS ?? "").trim()))),
);

// --- Protected: send a campaign ---
app.post("/api/send", async (c) => {
	if (
		!c.env.ADMIN_TOKEN ||
		c.req.header("x-admin-token") !== c.env.ADMIN_TOKEN
	) {
		return c.json({ ok: false, error: "unauthorized" }, 401);
	}
	// Signups work with zero config; sending needs your own email provider wired
	// up in src/email.ts. Fail clearly until then.
	if (!isEmailConfigured(c.env)) {
		return c.json({ ok: false, error: "email_not_configured" }, 400);
	}
	const { subject, html, testEmail } = await c.req
		.json<{
			subject?: string;
			html?: string;
			testEmail?: string;
		}>()
		.catch(() => ({}) as any);
	if (!subject || !html)
		return c.json({ ok: false, error: "missing_subject_or_html" }, 400);

	const origin = new URL(c.req.url).origin;

	// Test send: only to the given address, using a throwaway token.
	if (testEmail) {
		if (!EMAIL_RE.test(testEmail))
			return c.json({ ok: false, error: "invalid_test_email" }, 400);
		const t = crypto.randomUUID();
		const unsub = unsubUrl(origin, t);
		await sendEmail(c.env, {
			to: testEmail,
			subject,
			html: emailDocument(
				applyMergeTags(origin, html, t, testEmail) +
					complianceFooter(c.env, unsub),
			),
			headers: listHeaders(unsub),
		});
		return c.json({ ok: true, test: true });
	}

	// Queue and return immediately; the minutely cron delivers in the
	// background (SEND_BATCH emails per run).
	const queued = await enqueueCampaign(c.env, origin, subject, html);
	return c.json({ ok: true, queued });
});

// Build the email body for one feed item. broadcast() appends the compliance
// footer (unsubscribe link + postal address) per recipient.
function postEmailHtml(item: FeedItem): string {
	const text = (item.summary || "")
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	const excerpt = text
		? `<p>${text.slice(0, 300)}${text.length > 300 ? "…" : ""}</p>`
		: "";
	return `<h1>${item.title}</h1>
    ${excerpt}
    <p><a href="${item.link}">Read the full post →</a></p>`;
}

// Check the RSS feed and queue any new posts for delivery. Runs on the cron
// schedule. Opt-in: does nothing unless RSS_AUTOSEND is "true" and a feed URL
// is set.
async function runAutoSend(env: Bindings): Promise<void> {
	if (String(env.RSS_AUTOSEND ?? "").toLowerCase() !== "true") return;
	const feedUrl = (env.RSS_FEED_URL ?? "").trim();
	const baseUrl = (env.PUBLIC_URL ?? "").trim().replace(/\/$/, "");
	if (!feedUrl || !baseUrl || !isEmailConfigured(env)) return;

	let items: FeedItem[];
	try {
		items = await fetchFeedItems(feedUrl);
	} catch {
		return; // transient feed/network error — try again next run
	}
	if (!items.length) return;

	const { results } = await env.DB.prepare(
		`SELECT item_id FROM sent_posts`,
	).all<{ item_id: string }>();
	const seen = new Set(results.map((r) => r.item_id));
	const fresh = items.filter((i) => !seen.has(i.id));
	if (!fresh.length) return;

	const markSeen = (id: string) =>
		env.DB.prepare(`INSERT OR IGNORE INTO sent_posts (item_id) VALUES (?1)`)
			.bind(id)
			.run();

	// First run: record the current feed as a baseline without emailing the
	// whole back catalogue. Only posts published afterwards go out.
	if (seen.size === 0) {
		for (const i of fresh) await markSeen(i.id);
		return;
	}

	// Feeds are newest-first; queue oldest-first for chronological delivery.
	for (const item of fresh.reverse()) {
		await enqueueCampaign(
			env,
			baseUrl,
			item.title || "New post",
			postEmailHtml(item),
		);
		await markSeen(item.id);
	}
}

export default {
	fetch: app.fetch,
	async scheduled(
		controller: ScheduledController,
		env: Bindings,
		_ctx: ExecutionContext,
	) {
		// One minutely cron: the queue drains every run; the RSS feed check keeps
		// a 15-minute cadence within it.
		if (new Date(controller.scheduledTime).getUTCMinutes() % 15 === 0) {
			await runAutoSend(env);
		}
		await drainOutbox(env);
	},
};
