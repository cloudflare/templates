[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/ai-image-detection-uploads-template)

# AI Image Detection for Uploads

<!-- dash-content-start -->

Upload images directly to [Cloudflare Images](https://developers.cloudflare.com/images/) and analyze them with the `@cf/images/ai-image-detection` model on [Workers AI](https://developers.cloudflare.com/workers-ai/).

The browser uploads each file through a one-time Direct Creator Upload URL. The Worker then reads the stored image through the Images binding, runs inference, and saves the result as image metadata. The included API also demonstrates metadata range filters without a separate database.

The model score is an estimate, not proof that an image is authentic or AI-generated. Choose and validate any decision threshold for your own use case.

<!-- dash-content-end -->

## Requirements

Hosted image storage requires a [paid Cloudflare Images plan](https://developers.cloudflare.com/images/pricing/#images-paid). Workers AI usage is billed separately.

The example routes are public by default. Add authentication and rate limiting before using them with untrusted clients.

## Upload Flow

1. Request a one-time upload URL:

   ```http
   POST /uploads
   Content-Type: application/json

   { "mode": "basic" }
   ```

2. Upload a file to `upload_url` as multipart form field `file`.

3. Analyze the stored image:

   ```http
   POST /uploads/<IMAGE_ID>/analyze
   ```

The analysis response is also stored under the image's `ai_detection` metadata key:

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
		"image_id": "2cdc28f0-...",
		"filename": "photo.jpg",
		"content_type": "image/jpeg",
		"bytes": 182933
	}
}
```

`GET /uploads/<IMAGE_ID>` returns the stored status and result. Repeating an analysis with the same mode returns the stored result instead of running another inference.

## Metadata Filtering

List images created by this template and filter by model score:

```http
GET /images?min_score=0.5&max_score=0.9&limit=20
```

The Worker scopes all list and lookup operations to its fixed Images `creator` value. This prevents the routes from exposing unrelated images in the same account.

## Configuration

| Variable              |    Default | Purpose                                                   |
| --------------------- | ---------: | --------------------------------------------------------- |
| `ALLOWED_ORIGINS`     |        `*` | Comma-separated browser origins, or `*` for any origin.   |
| `DEFAULT_MODE`        |    `basic` | Detection mode used when the request omits one.           |
| `UPLOAD_EXPIRES_IN`   |     `1800` | Direct upload URL lifetime in seconds (`120` to `21600`). |
| `REQUIRE_SIGNED_URLS` |     `true` | Require signed delivery URLs for uploaded images.         |
| `MAX_IMAGE_BYTES`     | `20971520` | Maximum image size read for analysis.                     |

## Setup

```bash
npm create cloudflare@latest -- --template=cloudflare/templates/ai-image-detection-uploads-template
cd ai-image-detection-uploads-template
npm install
npm run dev
```

Wrangler simulates the Images binding locally. Workers AI inference still requires Cloudflare authentication, network access, and may incur usage charges.

## Commands

```bash
npm run dev
npm test
npm run check
npm run deploy
```

## Resources

- [Manage hosted images with the Images binding](https://developers.cloudflare.com/images/storage/binding/)
- [Direct Creator Upload](https://developers.cloudflare.com/images/storage/upload-images/direct-creator-upload/)
- [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
