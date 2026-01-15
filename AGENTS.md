# AGENTS.md

This guide helps AI agents review, maintain, and contribute to Cloudflare Worker templates. It documents patterns, common issues, and testing strategies learned from real PR reviews.

## Quick Reference

### Essential Commands

```bash
# Validate everything before starting work
pnpm run check

# After making changes, auto-fix what's possible
pnpm run fix

# Run template-specific tests
cd <template-dir> && pnpm test

# Lint templates for compliance
pnpm run check:templates
```

### PR Review Checklist

When reviewing a template PR, verify these items in order:

1. **package.json** - Has all required fields
2. **README.md** - Has dashboard markers and deploy button at top
3. **Tests** - Minimum 5 tests exist and pass
4. **Template Linter** - `pnpm run check:templates` passes
5. **Build** - Template compiles without errors

---

## Common Issues and Fixes

### 1. Missing `description` in package.json

**Symptom**: Template linter fails with missing description error.

**Fix**: Add a one-line description to package.json:

```json
{
	"name": "my-template",
	"description": "Brief description of what this template does."
}
```

### 2. Missing Dashboard Content Markers

**Symptom**: Dashboard won't display template details correctly.

**Fix**: Add markers around the content that should appear in Cloudflare Dashboard:

```markdown
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](...)

<!-- dash-content-start -->

## Overview

This template demonstrates...

<!-- dash-content-end -->

## Getting Started

...
```

**Important**: The Deploy to Cloudflare button should be at the TOP of the README, before the dash-content markers.

### 3. Deploy Button in Wrong Location

**Symptom**: Users can't easily find the deploy button.

**Fix**: Move the Deploy to Cloudflare button to the very top of README.md, before any other content.

### 4. Missing or Insufficient Tests

**Symptom**: Template has fewer than 5 tests or no test file.

**Fix**: Create tests using `@cloudflare/vitest-pool-workers`. See [Testing Patterns](#testing-patterns) below.

### 5. Using wrangler.toml Instead of wrangler.json

**Symptom**: Template linter fails with configuration format error.

**Fix**: Convert `wrangler.toml` to `wrangler.json` or `wrangler.jsonc`.

### 6. Missing package-lock.json

**Symptom**: Slower deployments, potential dependency issues.

**Fix**: Run from repo root:

```bash
pnpm run fix:lockfiles
```

---

## Testing Patterns

### Basic Test Setup

Every template needs a `vitest.config.ts` and test file(s). The simplest setup:

```typescript
// vitest.config.ts
import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject({
	test: {
		poolOptions: {
			workers: {
				singleWorker: true,
				wrangler: {
					configPath: "./wrangler.json",
				},
			},
		},
	},
});
```

```typescript
// test/index.test.ts
import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

describe("Template Name", () => {
	it("returns 200 on homepage", async () => {
		const response = await SELF.fetch("https://example.com/");
		expect(response.status).toBe(200);
	});

	it("returns HTML content", async () => {
		const response = await SELF.fetch("https://example.com/");
		const html = await response.text();
		expect(html).toContain("<!DOCTYPE html>");
	});

	// Add at least 3 more meaningful tests...
});
```

### Testing with Service Bindings (Stub Workers)

When a template uses Service Bindings to call other Workers, you need stub workers for testing. Define them inline in vitest.config.ts:

```typescript
// vitest.config.ts
import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

// Define stub worker as inline JavaScript
const stubWorkerScript = /* javascript */ `
export default {
  async fetch(request) {
    const url = new URL(request.url);
    return new Response(\`Stub response for: \${url.pathname}\`, {
      headers: { "Content-Type": "text/plain" },
    });
  },
};
`;

export default defineWorkersProject({
	test: {
		poolOptions: {
			workers: {
				singleWorker: true,
				wrangler: {
					configPath: "./wrangler.json",
				},
				miniflare: {
					workers: [
						{
							name: "my-service-binding-name", // Must match binding name in wrangler.json
							modules: [
								{
									type: "ESModule",
									path: "index.js",
									contents: stubWorkerScript,
								},
							],
							compatibilityDate: "2024-01-01",
						},
					],
				},
			},
		},
	},
});
```

### Testing Different Binding Types

**KV Namespace**: Automatically available via wrangler.json config, use `env.MY_KV` in tests.

**D1 Database**: Define migrations in wrangler.json, database is auto-created for tests.

**R2 Bucket**: Automatically available via wrangler.json config.

**Durable Objects**: Define in wrangler.json, accessible in tests.

**Service Bindings**: Use inline stub workers as shown above.

### What to Test

Aim for at least 5 tests covering:

1. **Happy path** - Main functionality works
2. **Error handling** - Invalid inputs return appropriate errors
3. **Edge cases** - Empty data, missing parameters
4. **API endpoints** - Each endpoint returns expected status/data
5. **HTML/UI** - Key elements are present in responses

---

## Code Review Patterns

### Logic Bug Detection

When reviewing template code, watch for these common issues:

**Request Interception Order**: Middleware or special endpoints must be checked BEFORE forwarding to upstream services.

```typescript
// WRONG - Check happens after fetch, never executes
const response = await upstream.fetch(request);
if (url.pathname === "/__special") {
	return new Response("special");
}

// CORRECT - Check happens before fetch
if (url.pathname === "/__special") {
	return new Response("special");
}
const response = await upstream.fetch(request);
```

**Environment Variable Access**: Bindings must be accessed from the `env` parameter, not global scope.

```typescript
// WRONG - Won't work in Workers
const db = globalThis.DB;

// CORRECT - Access from env parameter
export default {
	async fetch(request, env) {
		const db = env.DB;
	},
};
```

### README Quality

A good template README should have:

1. Deploy button at the very top
2. Dashboard content section with overview (between markers)
3. Screenshot or demo link
4. Local development instructions
5. Environment variables/secrets documentation
6. Links to relevant Cloudflare docs

---

## Pushing Changes to PRs

When updating a PR that exists on a different branch:

```bash
# Find the PR's actual branch name
gh pr view <PR_NUMBER> --json headRefName

# Push to the PR branch (not your local branch name)
git push origin HEAD:<pr-branch-name> --force-with-lease
```

Example:

```bash
# PR #877 is on branch "brayden/mfe"
git push origin HEAD:brayden/mfe --force-with-lease
```

---

## Workflow for Reviewing Template PRs

### 1. Initial Assessment

```bash
# Checkout the PR
gh pr checkout <PR_NUMBER>

# Run template linter first - catches most issues
pnpm run check:templates

# Run template's own tests
cd <template-dir> && pnpm test
```

### 2. Fix Common Issues

Address issues in this order (most common first):

1. Add missing `description` to package.json
2. Add/fix dashboard content markers in README.md
3. Move Deploy button to top of README.md
4. Add or fix tests to meet minimum of 5
5. Fix any code bugs discovered during testing

### 3. Verify Fixes

```bash
# From repo root
pnpm run check:templates
cd <template-dir> && pnpm test
```

### 4. Commit and Push

```bash
# Commit with descriptive message
git add -A
git commit -m "Add tests and address review feedback for <template-name>"

# Push to PR branch
git push origin HEAD:<pr-branch-name> --force-with-lease
```

---

## Template Compliance Summary

**For the full list of template requirements, see [CONTRIBUTING.md](./CONTRIBUTING.md).**

The CONTRIBUTING.md file contains the authoritative checklist for template compliance, including:

- `package.json` required fields and `cloudflare` metadata
- `README.md` content requirements and dashboard markers
- `package-lock.json` generation
- `.gitignore` requirements
- Playwright E2E test requirements
- Worker secrets and environment variables

### Waiting on Cloudflare Team

These items cannot be completed by external contributors:

- `cloudflare.preview_image_url` - Screenshot uploaded by Growth team
- `cloudflare.preview_icon_url` - Icon uploaded by Growth team
- `cloudflare.publish: true` - Set by Cloudflare team when ready to publish

---

## Debugging Tips

### Template Linter Not Finding Issues

The linter doesn't catch everything. Manual checks needed for:

- Dashboard content marker placement
- Deploy button position
- Code logic bugs
- Test quality (only checks count, not coverage)

### Tests Failing with Binding Errors

If tests fail with "binding not found" errors:

1. Check wrangler.json has the binding defined
2. For Service Bindings, add stub workers in vitest.config.ts
3. Ensure binding names match exactly (case-sensitive)

### Compatibility Date Warnings

```
The latest compatibility date supported by the installed Cloudflare Workers Runtime is "2025-09-06",
but you've requested "2025-10-08". Falling back to "2025-09-06"...
```

This warning is normal during local testing. The template linter enforces a specific compatibility date that may be newer than the locally installed runtime. Tests will still pass.
