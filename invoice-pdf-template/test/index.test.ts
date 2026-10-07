import { SELF, env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { buildInvoice, invoiceHtml, ValidationError } from "../src/invoice";

const sampleInvoice = {
	clientName: "Acme Corp",
	clientEmail: "billing@acme.example",
	issueDate: "2026-09-06",
	dueDate: "2026-10-06",
	currency: "USD",
	taxRate: 8.25,
	notes: "Net 30. Thank you!",
	items: [
		{ description: "Consulting", quantity: 10, unitPrice: 150 },
		{ description: "Hosting (monthly)", quantity: 1, unitPrice: 40 },
	],
};

async function createInvoice(body: unknown = sampleInvoice) {
	const res = await SELF.fetch("https://example.com/api/invoices", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
	return res;
}

describe("invoice model", () => {
	it("computes subtotal, tax and total", () => {
		const invoice = buildInvoice(sampleInvoice);
		expect(invoice.subtotal).toBe(1540);
		expect(invoice.tax).toBe(127.05);
		expect(invoice.total).toBe(1667.05);
		expect(invoice.number).toMatch(/^INV-\d{8}-[0-9A-F]{4}$/);
	});

	it("rejects invalid input", () => {
		expect(() => buildInvoice({ items: [] })).toThrow(ValidationError);
		expect(() => buildInvoice({ clientName: "X", items: [{}] })).toThrow(
			ValidationError,
		);
		expect(() =>
			buildInvoice({
				clientName: "X",
				items: [{ description: "a", quantity: -1, unitPrice: 1 }],
			}),
		).toThrow(/quantity/);
	});

	it("escapes user text in the document", () => {
		const invoice = buildInvoice({
			...sampleInvoice,
			clientName: "<script>alert(1)</script>",
		});
		const html = invoiceHtml(invoice);
		expect(html).not.toContain("<script>alert");
		expect(html).toContain("&lt;script&gt;");
	});
});

describe("Invoice PDF Generator", () => {
	it("serves the form UI from Workers Assets", async () => {
		const res = await SELF.fetch("https://example.com/");
		expect(res.status).toBe(200);
		expect(await res.text()).toContain("Invoice PDF Generator");
	});

	it("renders a PDF, stores it in R2 and indexes it in KV", async () => {
		const res = await createInvoice();
		expect(res.status).toBe(201);
		const data = (await res.json()) as {
			invoice: { id: string; number: string; total: number; r2Key: string };
			pdfUrl: string;
			warnings: string[];
		};
		expect(data.invoice.total).toBe(1667.05);
		expect(data.warnings).toEqual([]);

		// R2 holds the bytes with a PDF header.
		const object = await env.INVOICES.get(data.invoice.r2Key);
		expect(object).not.toBeNull();
		const bytes = new Uint8Array(await object!.arrayBuffer());
		expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");

		// KV holds the full invoice as the value and the summary as metadata.
		const stored = await env.INVOICE_INDEX.getWithMetadata<
			{ clientName: string },
			{ number: string }
		>(`invoice:${data.invoice.id}`, "json");
		expect(stored.value?.clientName).toBe("Acme Corp");
		expect(stored.metadata?.number).toBe(data.invoice.number);
	});

	it("serves the stored PDF back by id", async () => {
		const created = (await (await createInvoice()).json()) as {
			pdfUrl: string;
			invoice: { number: string };
		};
		const res = await SELF.fetch(`https://example.com${created.pdfUrl}`);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("application/pdf");
		expect(res.headers.get("content-disposition")).toContain(
			`inline; filename="${created.invoice.number}.pdf"`,
		);
		const bytes = new Uint8Array(await res.arrayBuffer());
		expect(bytes.length).toBeGreaterThan(1000);
		expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");

		const download = await SELF.fetch(
			`https://example.com${created.pdfUrl}?download`,
		);
		expect(download.headers.get("content-disposition")).toContain("attachment");
	});

	it("lists invoices newest first", async () => {
		await createInvoice({ ...sampleInvoice, number: "INV-FIRST" });
		await createInvoice({ ...sampleInvoice, number: "INV-SECOND" });
		const res = await SELF.fetch("https://example.com/api/invoices");
		expect(res.status).toBe(200);
		const { invoices } = (await res.json()) as {
			invoices: { number: string; clientName: string }[];
		};
		const numbers = invoices.map((i) => i.number);
		expect(numbers.indexOf("INV-SECOND")).toBeLessThan(
			numbers.indexOf("INV-FIRST"),
		);
		expect(invoices[0].clientName).toBe("Acme Corp");
	});

	it("returns 400 with a message for invalid input", async () => {
		const res = await createInvoice({ clientName: "", items: [] });
		expect(res.status).toBe(400);
		const { error } = (await res.json()) as { error: string };
		expect(error).toMatch(/line item/);

		const bad = await SELF.fetch("https://example.com/api/invoices", {
			method: "POST",
			body: "not json",
		});
		expect(bad.status).toBe(400);
	});

	it("deletes an invoice from both R2 and KV", async () => {
		const created = (await (await createInvoice()).json()) as {
			invoice: { id: string; r2Key: string };
		};
		const del = await SELF.fetch(
			`https://example.com/api/invoices/${created.invoice.id}`,
			{ method: "DELETE" },
		);
		expect(del.status).toBe(204);
		expect(await env.INVOICES.get(created.invoice.r2Key)).toBeNull();
		expect(
			await env.INVOICE_INDEX.get(`invoice:${created.invoice.id}`),
		).toBeNull();

		const gone = await SELF.fetch(
			`https://example.com/api/invoices/${created.invoice.id}/pdf`,
		);
		expect(gone.status).toBe(404);
	});

	it("returns 404 for unknown invoices", async () => {
		const res = await SELF.fetch("https://example.com/api/invoices/nope");
		expect(res.status).toBe(404);
		const del = await SELF.fetch("https://example.com/api/invoices/nope", {
			method: "DELETE",
		});
		expect(del.status).toBe(404);
	});
});
