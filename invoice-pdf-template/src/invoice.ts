// Invoice domain model: input validation, totals, and the HTML document the
// PDF engine renders. Nothing in this file touches a Cloudflare binding, so
// it is the part you would keep when swapping the invoice for your own
// document type.

export interface LineItemInput {
	description: string;
	quantity: number;
	unitPrice: number;
}

export interface InvoiceInput {
	/** Optional. Generated as INV-YYYYMMDD-XXXX when omitted. */
	number?: string;
	clientName: string;
	clientEmail?: string;
	/** ISO date (YYYY-MM-DD). Defaults to today. */
	issueDate?: string;
	/** ISO date (YYYY-MM-DD). Optional. */
	dueDate?: string;
	/** ISO 4217 code, e.g. "USD". Defaults to USD. */
	currency?: string;
	/** Percentage, e.g. 8.25 for 8.25%. Defaults to 0. */
	taxRate?: number;
	notes?: string;
	items: LineItemInput[];
}

export interface Invoice {
	id: string;
	number: string;
	clientName: string;
	clientEmail: string;
	issueDate: string;
	dueDate: string;
	currency: string;
	taxRate: number;
	notes: string;
	items: LineItemInput[];
	subtotal: number;
	tax: number;
	total: number;
	createdAt: string;
}

/** The subset of an invoice stored as KV metadata so `list()` returns it. */
export interface InvoiceSummary {
	id: string;
	number: string;
	clientName: string;
	issueDate: string;
	currency: string;
	total: number;
	createdAt: string;
	r2Key: string;
}

const MAX_ITEMS = 50;
const MAX_TEXT = 200;
const MAX_NOTES = 2000;

export class ValidationError extends Error {}

function text(value: unknown, field: string, max: number, required = false) {
	if (value === undefined || value === null) value = "";
	if (typeof value !== "string") {
		throw new ValidationError(`${field} must be a string`);
	}
	const trimmed = value.trim();
	if (required && trimmed.length === 0) {
		throw new ValidationError(`${field} is required`);
	}
	if (trimmed.length > max) {
		throw new ValidationError(`${field} must be at most ${max} characters`);
	}
	return trimmed;
}

function money(value: unknown, field: string) {
	const n = typeof value === "string" ? Number(value) : value;
	if (typeof n !== "number" || !Number.isFinite(n) || n < 0) {
		throw new ValidationError(`${field} must be a non-negative number`);
	}
	return Math.round(n * 100) / 100;
}

function isoDate(value: unknown, field: string, fallback: string) {
	if (value === undefined || value === null || value === "") return fallback;
	if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		throw new ValidationError(`${field} must be a date in YYYY-MM-DD form`);
	}
	return value;
}

function today() {
	return new Date().toISOString().slice(0, 10);
}

export function generateInvoiceNumber(now = new Date()) {
	const date = now.toISOString().slice(0, 10).replaceAll("-", "");
	const suffix = crypto.randomUUID().slice(0, 4).toUpperCase();
	return `INV-${date}-${suffix}`;
}

/** Validate untrusted JSON into an Invoice with computed totals. */
export function buildInvoice(raw: unknown, id = crypto.randomUUID()): Invoice {
	if (typeof raw !== "object" || raw === null) {
		throw new ValidationError("Request body must be a JSON object");
	}
	const input = raw as Record<string, unknown>;

	if (!Array.isArray(input.items) || input.items.length === 0) {
		throw new ValidationError("At least one line item is required");
	}
	if (input.items.length > MAX_ITEMS) {
		throw new ValidationError(`At most ${MAX_ITEMS} line items are allowed`);
	}

	const items: LineItemInput[] = input.items.map((item, i) => {
		const row = (item ?? {}) as Record<string, unknown>;
		return {
			description: text(
				row.description,
				`items[${i}].description`,
				MAX_TEXT,
				true,
			),
			quantity: money(row.quantity, `items[${i}].quantity`),
			unitPrice: money(row.unitPrice, `items[${i}].unitPrice`),
		};
	});

	const currency = text(input.currency, "currency", 3).toUpperCase() || "USD";
	if (!/^[A-Z]{3}$/.test(currency)) {
		throw new ValidationError("currency must be a 3-letter ISO 4217 code");
	}

	const taxRate = money(input.taxRate ?? 0, "taxRate");
	const subtotal = round(
		items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0),
	);
	const tax = round(subtotal * (taxRate / 100));

	return {
		id,
		number: text(input.number, "number", 40) || generateInvoiceNumber(),
		clientName: text(input.clientName, "clientName", MAX_TEXT, true),
		clientEmail: text(input.clientEmail, "clientEmail", MAX_TEXT),
		issueDate: isoDate(input.issueDate, "issueDate", today()),
		dueDate: isoDate(input.dueDate, "dueDate", ""),
		currency,
		taxRate,
		notes: text(input.notes, "notes", MAX_NOTES),
		items,
		subtotal,
		tax,
		total: round(subtotal + tax),
		createdAt: new Date().toISOString(),
	};
}

function round(n: number) {
	return Math.round(n * 100) / 100;
}

export function formatMoney(amount: number, currency: string) {
	try {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency,
		}).format(amount);
	} catch {
		return `${currency} ${amount.toFixed(2)}`;
	}
}

/** Escape user-supplied text before interpolating it into the document. */
export function escapeHtml(value: string) {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

/**
 * The invoice document. Deliberately small: one stylesheet, one table, no
 * images or custom fonts, so a render costs a few milliseconds of CPU. The
 * `@page` rule and the `@bottom-center` margin box are print CSS the engine
 * handles natively; a browser ignores them, a PDF honours them.
 */
export function invoiceHtml(invoice: Invoice) {
	const e = escapeHtml;
	const fmt = (n: number) => formatMoney(n, invoice.currency);

	const rows = invoice.items
		.map(
			(item) => `
			<tr>
				<td>${e(item.description)}</td>
				<td class="num">${item.quantity}</td>
				<td class="num">${fmt(item.unitPrice)}</td>
				<td class="num">${fmt(item.quantity * item.unitPrice)}</td>
			</tr>`,
		)
		.join("");

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Invoice ${e(invoice.number)}</title>
<style>
	@page {
		size: Letter;
		margin: 54pt;
		@bottom-center {
			content: "Invoice ${e(invoice.number)}";
			font-size: 9pt;
			color: #888;
		}
	}
	body { font-family: Helvetica, Arial, sans-serif; font-size: 11pt; color: #222; margin: 0; }
	h1 { font-size: 26pt; margin: 0 0 4pt 0; letter-spacing: 1pt; }
	.meta { color: #555; margin-bottom: 24pt; }
	.parties { margin-bottom: 24pt; }
	.parties h2 { font-size: 10pt; text-transform: uppercase; color: #888; margin: 0 0 4pt 0; }
	table { width: 100%; border-collapse: collapse; }
	th, td { padding: 6pt 8pt; text-align: left; border-bottom: 1pt solid #ddd; vertical-align: top; }
	th { background: #f3f3f3; font-size: 9.5pt; text-transform: uppercase; color: #555; }
	.num { text-align: right; }
	tr { break-inside: avoid; }
	/* Letter content width is 504pt (612pt minus 2 x 54pt margins). Percentage
	   margins are outside the engine subset, so position the totals block in pt. */
	.totals { width: 230pt; margin-left: 274pt; margin-top: 12pt; }
	.totals td { border: none; padding: 3pt 8pt; }
	.totals .grand td { border-top: 2pt solid #222; font-weight: bold; font-size: 13pt; padding-top: 6pt; }
	.notes { margin-top: 30pt; padding-top: 10pt; border-top: 1pt solid #ddd; color: #555; font-size: 10pt; }
</style>
</head>
<body>
	<h1>INVOICE</h1>
	<div class="meta">
		<div><strong>${e(invoice.number)}</strong></div>
		<div>Issued ${e(invoice.issueDate)}${invoice.dueDate ? ` &middot; Due ${e(invoice.dueDate)}` : ""}</div>
	</div>

	<div class="parties">
		<h2>Billed to</h2>
		<div>${e(invoice.clientName)}</div>
		${invoice.clientEmail ? `<div>${e(invoice.clientEmail)}</div>` : ""}
	</div>

	<table>
		<thead>
			<tr>
				<th>Description</th>
				<th class="num">Qty</th>
				<th class="num">Unit price</th>
				<th class="num">Amount</th>
			</tr>
		</thead>
		<tbody>${rows}
		</tbody>
	</table>

	<table class="totals">
		<tr><td>Subtotal</td><td class="num">${fmt(invoice.subtotal)}</td></tr>
		${invoice.taxRate > 0 ? `<tr><td>Tax (${invoice.taxRate}%)</td><td class="num">${fmt(invoice.tax)}</td></tr>` : ""}
		<tr class="grand"><td>Total</td><td class="num">${fmt(invoice.total)}</td></tr>
	</table>

	${invoice.notes ? `<div class="notes">${e(invoice.notes).replaceAll("\n", "<br>")}</div>` : ""}
</body>
</html>`;
}
