[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/ai-image-detection-template)

# AI Image Detection

<!-- dash-content-start -->

Analyze an image from a public HTTPS URL with the `@cf/images/ai-image-detection` model on [Workers AI](https://developers.cloudflare.com/workers-ai/).

The Worker validates redirects, file size, and image signatures before inference. Its response includes the model score and version, source details, and request timing. A static page served with [Workers Assets](https://developers.cloudflare.com/workers/static-assets/) provides a browser interface.

The score is a model estimate, not proof that an image is authentic or AI-generated. Choose and validate any decision threshold for your own use case.

<!-- dash-content-end -->

## API

Send an image URL and an optional detection mode:

```http
POST /analyze
Content-Type: application/json

{ "url": "https://example.com/image.jpg", "mode": "basic" }
```

`mode` can be `fast`, `basic`, or `advanced`. It defaults to `DEFAULT_MODE`.

```json
{
	"detection": {
		"model": "@cf/images/ai-image-detection",
		"score": 0.94,
		"mode": "basic",
		"model_version": "v2",
		"inference_time_ms": 340.1
	},
	"source": {
		"url": "https://example.com/image.jpg",
		"content_type": "image/jpeg",
		"bytes": 182933
	},
	"timing_ms": { "fetch": 120.4, "total": 465.8 }
}
```

Errors use the shape `{ "error": "..." }` with an appropriate HTTP status.

## Configuration

Edit the variables in `wrangler.jsonc` to change the defaults:

| Variable           |    Default | Purpose                                                      |
| ------------------ | ---------: | ------------------------------------------------------------ |
| `ALLOWED_ORIGINS`  |        `*` | Comma-separated browser origins, or `*` for any origin.      |
| `DEFAULT_MODE`     |    `basic` | Detection mode used when the request omits one.              |
| `MAX_IMAGE_BYTES`  | `20971520` | Maximum downloaded image size.                               |
| `MAX_REDIRECTS`    |        `3` | Maximum number of redirects.                                 |
| `FETCH_RETRIES`    |        `2` | Retries after network errors or source `5xx` responses.      |
| `FETCH_TIMEOUT_MS` |    `10000` | Timeout for each fetch attempt, including the response body. |

## Setup

Create a project from this template:

```bash
npm create cloudflare@latest -- --template=cloudflare/templates/ai-image-detection-template
```

Install dependencies and start the Worker:

```bash
npm install
npm run dev
```

Workers AI inference uses your Cloudflare account, requires network access during local development, and may incur usage charges. Review [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) before exposing the endpoint publicly.

## Commands

```bash
npm run dev
npm test
npm run check
npm run deploy
```

## Resources

- [Workers AI](https://developers.cloudflare.com/workers-ai/)
- [Workers Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Workers Fetch API](https://developers.cloudflare.com/workers/runtime-apis/fetch/)
