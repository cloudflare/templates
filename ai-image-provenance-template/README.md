[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/ai-image-provenance-template)

# AI Image Provenance Checker

<!-- dash-content-start -->

Inspect an image from a public HTTPS URL with three independent signals:

- An AI-generation score from the `@cf/images/ai-image-detection` model on [Workers AI](https://developers.cloudflare.com/workers-ai/).
- [C2PA](https://c2pa.org/) manifest validation with the official native library in a [Cloudflare Container](https://developers.cloudflare.com/containers/).
- EXIF and XMP capture or generator hints.

[Cloudflare Queues](https://developers.cloudflare.com/queues/) processes each analysis asynchronously, while [D1](https://developers.cloudflare.com/d1/) stores job status and results. The API reports each signal separately because neither a model score nor unsigned metadata proves how an image was created.

<!-- dash-content-end -->

## How It Works

```text
POST /analyze -> D1 job -> Queue -> download image
                                      |-> C2PA Container
                                      |-> Workers AI
                                      `-> D1 result

GET /jobs/<ID> -> D1 result
```

The C2PA verifier distinguishes a trusted manifest from a valid but untrusted manifest. A trusted manifest proves that its signed assertions validate; it does not prove that the image is authentic. EXIF and XMP hints are unsigned and should be treated as context only.

For safety, the verifier does not follow remote manifest references embedded in untrusted images. It reports those references as `present_unverified`.

## API

Queue an image for analysis:

```http
POST /analyze
Content-Type: application/json

{ "url": "https://example.com/image.jpg", "mode": "basic" }
```

`mode` can be `fast`, `basic`, or `advanced`, and is optional. If omitted, the model applies its own default, currently `advanced`.

```json
{ "job_id": "5c1b...", "status": "queued" }
```

Poll the job:

```http
GET /jobs/5c1b...
```

```json
{
	"job_id": "5c1b...",
	"status": "complete",
	"result": {
		"detection": {
			"model": "@cf/images/ai-image-detection",
			"score": 0.94,
			"mode": "basic",
			"model_version": "v2",
			"inference_time_ms": 340.1
		},
		"provenance": {
			"c2pa": { "status": "verified", "declares_ai_generation": true },
			"metadata": {
				"status": "found",
				"capture_hints": [],
				"ai_hints": ["digital_source_type"]
			}
		},
		"source": {
			"url": "https://example.com/image.jpg",
			"content_type": "image/jpeg",
			"bytes": 182933
		},
		"timing_ms": { "fetch": 120.4, "provenance": 640.2, "total": 1102.3 }
	}
}
```

Job status can be `queued`, `processing`, `retrying`, `complete`, or `failed`.
Unhandled delivery failures that exhaust their retries are retained in the `ai-image-provenance-jobs-dlq` dead-letter queue for inspection and manual recovery instead of being discarded. Expected source and inference failures are recorded as a terminal `failed` job instead.

## Configuration

| Variable                 |         Default | Purpose                                                      |
| ------------------------ | --------------: | ------------------------------------------------------------ |
| `ALLOWED_ORIGINS`        |             `*` | Comma-separated browser origins, or `*` for any origin.      |
| `MAX_IMAGE_BYTES`        |      `20971520` | Maximum downloaded image size.                               |
| `MAX_REDIRECTS`          |             `3` | Maximum number of redirects.                                 |
| `FETCH_RETRIES`          |             `2` | Retries after network errors or source `5xx` responses.      |
| `FETCH_TIMEOUT_MS`       |         `10000` | Timeout for each fetch attempt, including the response body. |
| `ENABLE_C2PA`            |          `true` | Run C2PA manifest validation.                                |
| `ENABLE_METADATA_CHECK`  |          `true` | Read EXIF and XMP hints.                                     |
| `C2PA_TRUST_ANCHORS_URL` | C2PA trust list | PEM trust anchors used for manifest validation.              |

The example routes are public by default. Add authentication and rate limiting before using them with untrusted clients.

## Setup

Docker must be running to build and start the C2PA container.

```bash
npm create cloudflare@latest -- --template=cloudflare/templates/ai-image-provenance-template
cd ai-image-provenance-template
npm install
npm run dev
```

`npm run dev` applies local D1 migrations before starting Wrangler. `npm run deploy` applies remote migrations before deployment.

## Commands

```bash
npm run dev
npm test
npm run check
npm run deploy
```

## Resources

- [C2PA specification](https://c2pa.org/specifications/specifications/2.1/specs/C2PA_Specification.html)
- [Cloudflare Containers](https://developers.cloudflare.com/containers/)
- [Cloudflare Queues](https://developers.cloudflare.com/queues/)
- [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
