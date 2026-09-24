# AI Domain Data Worker

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/ai-domain-data/templates/tree/main/ai-domain-data-template)

<!-- dash-content-start -->

The AI Domain Data Standard is an open, vendor-neutral format for publishing authoritative domain identity data for AI systems, search engines, and automated agents. This Worker serves your domain profile at `/.well-known/domain-profile.json` with built-in validation, CORS headers, and optional Cloudflare KV storage support.

**Key Features:**
- Serves `/.well-known/domain-profile.json` with proper CORS headers
- Built-in schema validation against the AI Domain Data Standard
- Configurable via environment variables or Cloudflare KV
- TypeScript with full type safety
- Production-ready with proper caching headers

The worker validates your domain profile against the official schema and returns detailed error messages if validation fails. It supports all optional fields including logo, entity_type, and embedded JSON-LD.

<!-- dash-content-end -->

## Getting Started

Outside of this repo, you can start a new project with this template using [C3](https://developers.cloudflare.com/pages/get-started/c3/) (the `create-cloudflare` CLI):

```
npm create cloudflare@latest -- --template=ai-domain-data/templates/ai-domain-data-template
```

A live public deployment of this template will be available at `https://ai-domain-data-template.templates.workers.dev` once deployed.

## Setup Steps

1. Install the project dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables in `wrangler.json`:
   ```json
   {
     "vars": {
       "AIDD_NAME": "Your Site Name",
       "AIDD_DESCRIPTION": "Your site description",
       "AIDD_WEBSITE": "https://example.com",
       "AIDD_CONTACT": "contact@example.com"
     }
   }
   ```

   Or set them in the Cloudflare dashboard under Workers & Pages → Your Worker → Settings → Variables.

3. Deploy the worker:
   ```bash
   npm run deploy
   ```

4. Set up a route in the Cloudflare dashboard:
   - Go to Workers & Pages → Your Worker → Settings → Triggers
   - Add route: `example.com/.well-known/domain-profile.json`
   - Or use Workers Routes for custom domains

## Configuration

### Required Environment Variables

- `AIDD_NAME` - Your site or organization name
- `AIDD_DESCRIPTION` - Description of your site
- `AIDD_WEBSITE` - Your website URL
- `AIDD_CONTACT` - Contact email or URL

### Optional Environment Variables

- `AIDD_SPEC` - Spec version URL (default: `https://ai-domain-data.org/spec/v0.1`)
- `AIDD_LOGO` - Logo URL
- `AIDD_ENTITY_TYPE` - Entity type (Organization, Person, Blog, etc.)
- `AIDD_JSONLD` - JSON-LD object as JSON string

### Using Cloudflare KV (Optional)

For dynamic updates, you can use KV storage:

1. Create a KV namespace in the Cloudflare dashboard
2. Add the binding to `wrangler.json`:
   ```json
   {
     "kv_namespaces": [
       {
         "binding": "AIDD",
         "id": "your-kv-namespace-id"
       }
     ]
   }
   ```
3. Store the profile JSON in KV with key `profile`

The worker will check KV first, then fall back to environment variables.

## Example Response

```json
{
  "spec": "https://ai-domain-data.org/spec/v0.1",
  "name": "Example Site",
  "description": "A description of the site",
  "website": "https://example.com",
  "contact": "contact@example.com"
}
```

## Testing

Test your deployment:

```bash
curl https://example.com/.well-known/domain-profile.json
```

Or use the [AI Domain Data Checker](https://ai-domain-data.org/checker).

## Learn More

- [AI Domain Data Standard](https://ai-domain-data.org) - The specification
- [GitHub Repository](https://github.com/ai-domain-data/cloudflare-worker-ai-domain-data) - Full documentation
- [WordPress Plugin](https://wordpress.org/plugins/ai-domain-data/) - WordPress implementation
- [Jekyll Plugin](https://github.com/ai-domain-data/jekyll-ai-domain-data) - Jekyll implementation
