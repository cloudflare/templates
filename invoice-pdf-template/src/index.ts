// Invoice PDF generator on Cloudflare Workers.
//
//   POST   /api/invoices          validate the form, render a PDF, store it
//   GET    /api/invoices          list previously generated invoices (KV)
//   GET    /api/invoices/:id      one invoice's metadata (KV)
//   GET    /api/invoices/:id/pdf  the PDF bytes (R2)
//   DELETE /api/invoices/:id      remove the PDF and its index entry
//
// Everything else is served from ./public by Workers Assets.

import { Hono } from "hono";
import { init, renderHtml } from "@formepdf/html/worker";
// Wrangler treats `.wasm` imports as CompiledWasm modules and gives us a
// `WebAssembly.Module`. The web-target build is the one that works in
// workerd: it does not try to instantiate itself at module load.
import wasm from "@formepdf/html/pkg-web/forme_pdf_html_bg.wasm";
import {
	buildInvoice,
	invoiceHtml,
	ValidationError,
	type Invoice,
	type InvoiceSummary,
} from "./invoice";

const KV_PREFIX = "invoice:";
const R2_PREFIX = "invoices/";

const app = new Hono<{ Bindings: Env }>();

app.onError((err, c) => {
	if (err instanceof ValidationError) {
		return c.json({ error: err.message }, 400);
	}
	console.error(err);
	return c.json({ error: "Internal error" }, 500);
});

app.get("/api/invoices", async (c) => {
	// KV `list()` returns each key's metadata, so one call is enough to build
	// the table without a `get()` per invoice.
	const { keys } = await c.env.INVOICE_INDEX.list<InvoiceSummary>({
		prefix: KV_PREFIX,
	});
	const invoices = keys
		.flatMap((key) => (key.metadata ? [key.metadata] : []))
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	return c.json({ invoices });
});

app.post("/api/invoices", async (c) => {
	const body = await c.req.json().catch(() => {
		throw new ValidationError("Request body must be valid JSON");
	});
	const invoice = buildInvoice(body);

	// Instantiate the layout engine. `init` is idempotent: the first request
	// in an isolate pays for instantiation, later ones reuse it.
	await init(wasm);
	const { pdf, warnings } = renderHtml(invoiceHtml(invoice), {
		pageSize: "Letter",
	});

	const r2Key = `${R2_PREFIX}${invoice.id}.pdf`;
	await c.env.INVOICES.put(r2Key, pdf, {
		httpMetadata: { contentType: "application/pdf" },
		customMetadata: { invoiceNumber: invoice.number },
	});

	const summary: InvoiceSummary = {
		id: invoice.id,
		number: invoice.number,
		clientName: invoice.clientName,
		issueDate: invoice.issueDate,
		currency: invoice.currency,
		total: invoice.total,
		createdAt: invoice.createdAt,
		r2Key,
	};
	// Value: the full invoice. Metadata: the summary the list endpoint needs.
	await c.env.INVOICE_INDEX.put(
		`${KV_PREFIX}${invoice.id}`,
		JSON.stringify(invoice),
		{ metadata: summary },
	);

	return c.json(
		{
			invoice: summary,
			pdfUrl: `/api/invoices/${invoice.id}/pdf`,
			// The engine names anything outside its supported CSS subset here
			// instead of silently dropping it. Empty for this document.
			warnings,
		},
		201,
	);
});

app.get("/api/invoices/:id", async (c) => {
	const invoice = await c.env.INVOICE_INDEX.get<Invoice>(
		`${KV_PREFIX}${c.req.param("id")}`,
		"json",
	);
	if (!invoice) return c.json({ error: "Invoice not found" }, 404);
	return c.json({ invoice });
});

app.get("/api/invoices/:id/pdf", async (c) => {
	const id = c.req.param("id");
	const object = await c.env.INVOICES.get(`${R2_PREFIX}${id}.pdf`);
	if (!object) return c.json({ error: "PDF not found" }, 404);

	const number = object.customMetadata?.invoiceNumber ?? id;
	const disposition =
		c.req.query("download") !== undefined ? "attachment" : "inline";
	return new Response(object.body, {
		headers: {
			"content-type": "application/pdf",
			"content-length": String(object.size),
			"content-disposition": `${disposition}; filename="${number}.pdf"`,
			etag: object.httpEtag,
		},
	});
});

app.delete("/api/invoices/:id", async (c) => {
	const id = c.req.param("id");
	const key = `${KV_PREFIX}${id}`;
	const existing = await c.env.INVOICE_INDEX.get(key);
	if (!existing) return c.json({ error: "Invoice not found" }, 404);
	await Promise.all([
		c.env.INVOICES.delete(`${R2_PREFIX}${id}.pdf`),
		c.env.INVOICE_INDEX.delete(key),
	]);
	return c.body(null, 204);
});

// Unknown /api routes get a JSON 404. Anything else is a static file request
// (only reached in local tests; in production Workers Assets serves ./public
// before the Worker runs for non-/api paths).
app.notFound((c) => {
	if (c.req.path.startsWith("/api/")) {
		return c.json({ error: "Not found" }, 404);
	}
	return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
