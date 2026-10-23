# Invoice PDF Generator

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/invoice-pdf-template)

Generate invoice PDFs inside a Worker from HTML and print CSS, with no headless browser. Rendered PDFs are stored in [R2](https://developers.cloudflare.com/r2/) and indexed in [KV](https://developers.cloudflare.com/kv/) so the list of previous invoices persists.

**Live demo:** https://invoice-pdf-template.templates.workers.dev/

<!-- dash-content-start -->

## Features

- **Fill in a form, get a PDF** - Client, line items, tax rate, notes. The Worker validates the input, computes the totals, and renders a Letter-size PDF.
- **In-process rendering** - HTML and print CSS go into [@formepdf/html](https://www.npmjs.com/package/@formepdf/html), a Rust layout engine compiled to WebAssembly. PDF bytes come out. No browser, no external API, nothing leaves the Worker.
- **Stored in R2, indexed in KV** - Each PDF is written to an R2 bucket and served back by key. Invoice metadata (number, client, total, R2 key) lives in KV so the "previous invoices" list survives across requests and isolates.
- **Plain UI** - A small static page served by Workers Assets. Meant to be replaced with your own form or called from your own app.

## How it works

1. `POST /api/invoices` validates the JSON body and builds an HTML invoice with a `@page` rule, a running footer, and a line-item table.
2. The Worker calls `init(wasm)` once per isolate to instantiate the layout engine, then `renderHtml()` to get PDF bytes synchronously.
3. The PDF is written to R2 with `content-type: application/pdf`. A summary is written to KV as metadata, so `list()` can populate the invoice table in one call.
4. `GET /api/invoices/:id/pdf` streams the object back from R2, inline or as a download.

## Bindings used

- **INVOICES** (R2) - Rendered PDF files
- **INVOICE_INDEX** (KV) - Invoice metadata for the list view
- **ASSETS** (Workers Assets) - The static form UI

## Plan requirements

Rendering costs CPU time, and that is the constraint to plan around, not bundle size. On a local workerd instance the sample invoice renders in about 20 ms of CPU, while the [Workers Free plan](https://developers.cloudflare.com/workers/platform/limits/) caps CPU at 10 ms per request. **This template needs the Workers Paid plan to render real documents.** The 7.6 MB engine fits comfortably inside the 64 MiB uncompressed script limit on every plan.

<!-- dash-content-end -->

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:8787, fill in the form, and click **Render PDF**. Local development uses Wrangler's simulated R2 bucket and KV namespace, so nothing needs to be created first.

### Tests

```bash
npm test
```

The tests run inside workerd through `@cloudflare/vitest-pool-workers`, so they exercise the real WASM engine, R2, and KV bindings rather than mocks.

### Deploy

The **Deploy to Cloudflare** button provisions the R2 bucket and KV namespace for you. For a manual deploy, create them once and paste the KV namespace id into `wrangler.jsonc`:

```bash
npx wrangler r2 bucket create invoice-pdfs
npx wrangler kv namespace create INVOICE_INDEX
npm run deploy
```

## API

| Method   | Path                    | Description                                    |
| -------- | ----------------------- | ---------------------------------------------- |
| `GET`    | `/api/invoices`         | List invoices, newest first (from KV metadata) |
| `POST`   | `/api/invoices`         | Validate, render, store. Returns `201` + JSON  |
| `GET`    | `/api/invoices/:id`     | Full invoice JSON                              |
| `GET`    | `/api/invoices/:id/pdf` | The PDF from R2. Add `?download` for a file    |
| `DELETE` | `/api/invoices/:id`     | Remove the PDF and its index entry             |

Example request body:

```json
{
	"clientName": "Acme Corp",
	"clientEmail": "billing@acme.example",
	"issueDate": "2026-09-06",
	"dueDate": "2026-10-06",
	"currency": "USD",
	"taxRate": 8.25,
	"notes": "Net 30. Thank you!",
	"items": [
		{ "description": "Consulting", "quantity": 10, "unitPrice": 150 },
		{ "description": "Hosting (monthly)", "quantity": 1, "unitPrice": 40 }
	]
}
```

The response includes a `warnings` array. The engine names any CSS outside its supported subset there instead of silently dropping it. The bundled invoice renders with no warnings.

## Performance and CPU time

Measured in workerd on a development laptop (Apple Silicon), for the two-line sample invoice in `test/index.test.ts`:

| Stage                                             | Time    |
| ------------------------------------------------- | ------- |
| `init(wasm)` (instantiate the precompiled module) | ~1 ms   |
| First render in a fresh isolate                   | ~65 ms  |
| Warm render (median of 20)                        | ~20 ms  |
| Warm `POST /api/invoices` end to end              | ~25 ms  |
| Worker upload size                                | 7.4 MiB |

These are wall-clock numbers from a local machine. Production CPU time varies by document and by hardware; check the `cpuTime` field in [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/) after deploying to see what your documents actually cost.

Things that make a document cost more CPU:

- **More content.** Layout is roughly linear in the number of boxes. Long line-item tables and multi-page documents take longer.
- **Page counters.** `counter(page)` / `counter(pages)` or `{{pageNumber}}` placeholders can trigger a second or third layout pass while the engine reserves the right width for the number. The bundled invoice uses a static footer to stay at one pass.
- **Custom fonts.** Registering TTF fonts through the `fonts` option adds parsing and embedding work. The invoice uses the built-in Helvetica metrics.

## Project structure

```
src/index.ts      Hono routes: render, list, fetch, delete
src/invoice.ts    Validation, totals, and the HTML invoice document
src/wasm.d.ts     Type for the .wasm import
public/           Static form UI served by Workers Assets
test/             Vitest tests that run inside workerd
wrangler.jsonc    Bindings: R2 bucket, KV namespace, assets
```

To use this for a different document type, replace `invoiceHtml()` in `src/invoice.ts` and adjust the validation. The render, store, and serve routes do not care what the document is.

## Learn more

- [@formepdf/html](https://www.npmjs.com/package/@formepdf/html) - supported CSS subset and options
- [Workers Assets](https://developers.cloudflare.com/workers/static-assets/)
- [R2](https://developers.cloudflare.com/r2/) and [KV](https://developers.cloudflare.com/kv/)
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) - CPU time and script size per plan
