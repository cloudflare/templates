# Templates for Cloudflare Workers

Cloudflare Workers let you deploy serverless code instantly across the globe for exceptional performance, reliability, and scale. This repository contains a collection of starter templates for building full-stack applications on Workers. **You are encouraged to use, modify, and extend this code!**

## Getting Started

There are two ways to start building with a template in this repository: the [Cloudflare dashboard](https://dash.cloudflare.com/) and [C3](https://developers.cloudflare.com/pages/get-started/c3/) (the `create-cloudflare` CLI).

### Starting from the Dashboard

After logging in or signing up through the [Cloudflare dashboard](https://dash.cloudflare.com/), open the [Workers templates page](https://dash.cloudflare.com/?to=/:account/workers-and-pages/templates) and select a template to get started with. From here, you can create a repository and deploy your first Worker without needing a local development environment.

### Starting via CLI

To get started locally, run one of the following commands:

```bash
npm create cloudflare@latest
# or
pnpm create cloudflare@latest
# or
yarn create cloudflare@latest
```

For more information on getting started with our CLI, check out the [getting started guide](https://developers.cloudflare.com/workers/get-started/guide/).

### Additional Resources

Questions about Workers? Join the [official Cloudflare Discord](https://workers.community/) or check out the [Workers docs](https://developers.cloudflare.com/workers/)!

## End-to-End Testing

This repository includes a comprehensive Playwright-based E2E test suite that validates all templates to ensure they work correctly. The test system supports both **local development mode** (spinning up dev servers) and **live mode** (testing against deployed templates).

### Running E2E Tests

#### Local Development Mode (Default)

By default, tests run against locally started development servers:

```bash
# Run all E2E tests
pnpm run test:e2e

# Run tests for specific templates
pnpm run test:e2e astro-blog-starter-template.spec.ts
pnpm run test:e2e saas-admin-template.spec.ts

# Run tests with UI mode for debugging
pnpm run test:e2e --ui
```

In local mode:

- Tests start development servers automatically for each template
- Uses one worker to prevent port conflicts
- Servers are properly cleaned up between different template tests
- Longer timeouts to account for build and startup time

#### Live Mode (Testing Deployed Templates)

To test against live deployed templates, set the `PLAYWRIGHT_USE_LIVE` environment variable:

```bash
# Run tests against live deployed templates
pnpm run test:e2e:live

# Run specific template tests in live mode
pnpm run test:e2e:live saas-admin-template.spec.ts
```

In live mode:

- Tests run against `https://{template-name}.templates.workers.dev`
- Enables parallel execution (up to 4 workers locally, 2 in CI)
- Faster execution since no local server startup required
- Shorter timeouts since templates are already running

### Test Architecture

The test system includes:

- **Automatic template discovery**: Finds all `*-template` directories and analyzes their framework
- **Smart server management**: Detects framework type (Astro, Next.js, Vite, etc.) and uses appropriate ports
- **Reliable cleanup**: Properly terminates process trees between test runs
- **Flexible URL resolution**: Automatically determines live URLs from `wrangler.json` configuration

### Writing Template Tests

Template tests should be named `{template-name}.spec.ts` and placed in the `playwright-tests/` directory:

```typescript
import { test, expect } from "./fixtures";

test.describe("My Template", () => {
	test("should render correctly", async ({ page, templateUrl }) => {
		await page.goto(templateUrl);
		await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible();
	});
});
```

The `templateUrl` fixture automatically provides the correct URL (local dev server or live deployment) based on the test mode.

#### Playwright Codegen

Playwright includes a test code generation utility that records your actions in a chromium browswer. To start the codegen utility run

```bash
pnpm playwright codgen
```

## Contributing

We welcome template contributions! If there's a Workers template you think would be valuable, please read our [contributing guide](./CONTRIBUTING.md) and open an issue or pull request.
