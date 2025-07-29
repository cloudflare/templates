# Contributing

We welcome template contributions that help demonstrate the full-stack capabilities of the Workers platform. If you're unsure about whether a template would be a good fit for this repository, feel free to open an issue with a link or description of your template idea to get feedback before opening a pull request.

We're especially interested in templates that use multiple binding or handler types together (e.g. [D1 databases](https://developers.cloudflare.com/d1/), [Workers AI](https://developers.cloudflare.com/workers-ai/), or [queue consumers](https://developers.cloudflare.com/queues/configuration/configure-queues/#consumer)).

## CI Checks

Code formatting, linting, and all other checks are covered under the `check` script. The `fix` script will automatically fix as many of these issues as possible.

If CI is failing on your pull request, running `pnpm run fix` in the repository root might solve your problems.

## Requirements

In order to introduce a new template to this collection, the following requirements must all be satisfied. For a boiled-down version of these requirements, scroll down to the [Checklist](#checklist).

### `package.json` content

Cloudflare's Templates Platform extracts `name`, `description`, and a `cloudflare` object directly from each template's `package.json` configuration. This extracted metadata provides content necessary for the template to be rendered in the Cloudflare Dashboard. If the minimally required values are not included in your template, it will fail CI.

| Required?         | Package.json key               | Description                                                                                                                                                                                                                                           | Example                                                                                                  |
| ----------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| ✅                | `name`                         | Kebab-case name of your template, should match directory, should end in `-template`.                                                                                                                                                                  | durable-chat-template                                                                                    |
| ✅                | `description`                  | Brief, one-line description of the template                                                                                                                                                                                                           | Chat with other users in real-time using Durable Objects and PartyKit.                                   |
|                   | `cloudflare`                   | Object you will nest all cloudflare-specific keys in                                                                                                                                                                                                  |                                                                                                          |
|                   | `cloudflare.bindings`          | Object containing information about each binding. Keys should be the binding names and values should be an object with a "description" string. Inline markdown `` `code` ``, `**bold**`, `__italics__` and `[links](https://example.com/)` are valid. | ``{ "COOKIE_SIGNING_KEY": { "description": "Generate a random string using `openssl rand -hex 32`" } }`` |
| _if publish=true_ | `cloudflare.label`             | Title Case version of name for use in Cloudflare's Dashboard                                                                                                                                                                                          | Durable Chat App                                                                                         |
| _if publish=true_ | `cloudflare.products`          | List 3 or fewer products featured in your example                                                                                                                                                                                                     | ["D1", "Durable Objects"]                                                                                |
| ❌                | `cloudflare.categories`        | String(s) that map to filter(s) in the template gallery view                                                                                                                                                                                          | ["starter", "storage"]                                                                                   |
| _if publish=true_ | `cloudflare.preview_image_url` | 16:9 aspect screenshot of the template application                                                                                                                                                                                                    | (Link will be provided during PR review)                                                                 |
| ❌                | `cloudflare.publish`           | Boolean to opt-in for display in the Cloudflare Dashboard - leave out unless requested by the Cloudflare team                                                                                                                                         | (Primarily for internal contributor use)                                                                 |

### Best Practices: `package.json`

- **`cloudflare.bindings.[bindingName].description`** - Include a description for any binding which requires additional information on how to configure, especially for any values which are found outside of Cloudflare (e.g. API keys).
- **`cloudflare.products`** - Do not exceed 3 products listed. Focus on highlighting the most unique products featured in your template (e.g. majority of our templates leverage 'Worker Assets' in some capacity, but only a select few feature 'DO').
- **`cloudflare.categories`**
  - Today, categories are optional to include. In the future, we will support filters in the templates gallery at which point this will become a new template requirement.
  - Only the following categories are supported: `"starter"`, `"storage"`, and `"ai"`. Anything outside of this set will be rejected by CI.
- **`cloudflare.preview_image_url`**
  - Can only be provided by a Cloudflare team member. Image files for icons and preview images are stored in the Cloudflare Templates CF account.
  - Preview image should be a screenshot of the application running in-browser.

### `package-lock.json`

All of our templates and Deploy to Cloudflare projects automatically set up Workers CI. In our testing, including a package lock file in the template repository speeds up module resolution by 80% or more.

To generate a `package-lock.json` for your template, run this command in the root of the repository:

```sh
pnpm fix:lockfiles
```

### README.md content

Every ReadMe should include a “getting started” section that provides guidance for running the application locally, directions for installing any third-party tokens, and a description of the application’s functionality. You should also include a screenshot and/or live deployment of the application.

A portion of your template’s README.md file will be displayed on the Template Details Page in the Cloudflare Dashboard to provide the user with additional information about the template.

- ✅ This section _should_ include: Key features of the template, which bindings and frameworks the template uses, and a short description of how the template application works.
- ❌ This section _should not_ include: Project bootstrapping instructions, shell commands, or additional images (but these things should still be included in the longer project ReadMe).

You can designate the block of content to display by wrapping it in a markdown comment like so:

```md template/readme.md
This content will NOT be included in the Template Details Page

<!-- dash-content-start -->

This content will be included in Template Details Page

<!-- dash-content-end -->

This content will NOT be included in the Template Details Page
```

### Worker secrets, environment variables, and Secrets Store secrets

You can create templates which use [Worker secrets](https://developers.cloudflare.com/workers/platform/environment-variables#secrets), [environment variables](https://developers.cloudflare.com/workers/configuration/environment-variables) or [Secrets Store secrets](https://developers.cloudflare.com/secrets-store/).

Although these will be configured by users during deployment, we still recommend confirming these are present and valid within your deployed application. Let your users know with a prominent warning within the deployed application's UI if anything is invalid. See [this example](https://saas-admin-template.templates.workers.dev/admin) from a current template.

#### Workers Secrets

Create a `.dev.vars.example` or `.env.example` file in the root of your template repository with a [dotenv](https://www.npmjs.com/package/dotenv) format:

```ini
COOKIE_SIGNING_KEY=my-secret # example comment: should be a real random string in production
```

[Secrets Store](https://developers.cloudflare.com/secrets-store/) secrets can be configured in the Wrangler configuration file as normal:

```json
{
  "name": "my-worker",
  "main": "./src/index.ts",
  "compatibility_date": "$today",
  "secrets_store_secrets": [
    {
      "binding": "API_KEY",
      "store_id": "demo",
      "secret_name": "api-key"
    }
  ]
}
```

#### Environment Variables

Environment variables can also be configured in the Wrangler configuration file as normal:

```json
{
  "name": "my-worker",
  "main": "./src/index.ts",
  "compatibility_date": "$today",
  "vars": {
    "API_HOST": "https://example.com"
  }
}
```

## Playwright E2E Tests

All templates must include Playwright end-to-end tests to ensure critical functionality works correctly. Tests should be minimal smoke tests that verify the most important user flows.

### Setting up Playwright Tests

Playwright is installed

1. **Create test file** in the playwright-tests directory. Your test file should match the directory name of your template.

2. **Basic test structure**:

   ```typescript
   import { test, expect } from "@playwright/test";

   test("homepage loads correctly", async ({ page }) => {
     await page.goto("/");
     await expect(page.locator("h1")).toBeVisible();
   });
   ```

### Using Playwright Codegen

Playwright's codegen feature lets you generate tests by clicking through your application:

1. **Start your development server**:

   ```bash
   pnpm dev
   ```

2. **Run codegen**:

   ```bash
   pnpm test:e2e:codegen
   ```

3. **Record your test**:
   - A browser window and Playwright Inspector will open
   - Navigate through your application's critical paths
   - Click, type, and interact as a user would
   - Playwright automatically generates test code in the Inspector

4. **Copy generated code** into your test file and refine as needed

### Test Guidelines

- **Keep tests minimal**: Focus on critical user paths only
- **Test key functionality**: Form submissions, navigation, data loading
- **Avoid implementation details**: Test what users see, not internal code
- **Use descriptive test names**: Clearly describe what each test validates

## Checklist

The above requirements, distilled into checklist form:

- [ ] Confirm your template directory ends in `-template`
- [ ] Confirm your template is working as expected, both locally and deployed
- [ ] Write a clear, concise, and helpful ReadMe - Use a developer-oriented tone; provide neither too much nor too little detail
- [ ] Designate which section of content should be displayed in the Cloudflare Dashboard by wrapping it in \<!-- dash-content-start --> and \<!-- dash-content-end -->
- [ ] Include a link to the publicly-accessible deployed preview in your ReadMe
- [ ] Include the most up-to-date package lock file
- [ ] Add Playwright E2E tests covering critical user paths
- [ ] Open a PR against the public repository's main branch

#### Enforced by CI

These checklist items are enforced by our CI/CD pipeline:

- [ ] Include required metadata in package.json (name, description, cloudflare.label, cloudflare.products, cloudflare.preview_image_url)
- [ ] Include a preview image of the application (16:9 aspect ratio, >=500px width) in your template assets
