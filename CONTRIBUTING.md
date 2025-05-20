# Contributing

We welcome template contributions that help demonstrate the full-stack capabilities of the Workers platform. If you're unsure about whether a template would be a good fit for this repository, feel free to open an issue with a link or description of your template idea to get feedback before opening a pull request.

We're especially interested in templates that use multiple binding or handler types together (e.g. [D1 databases](https://developers.cloudflare.com/d1/), [Workers AI](https://developers.cloudflare.com/workers-ai/), or [queue consumers](https://developers.cloudflare.com/queues/configuration/configure-queues/#consumer)).

## CI Checks

Code formatting, linting, and all other checks are covered under the `check:ci` script. The `fix:ci` script will automatically fix as many of these issues as possible.

If CI is failing on your pull request, running `pnpm run fix:ci` in the repository root might solve your problems.

## Requirements

In order to introduce a new template to this collection, the following requirements must all be satisfied. For a boiled-down version of these requirements, scroll down to the [Checklist](#checklist).

### Package.json content

Cloudflare's Templates Platform extracts `name`, and `description`, and a `cloudflare` object directly from each template's `package.json` configuration. This extracted metadata provides content necessary for the template to be rendered in the Cloudflare dashboard. If the minimally required values are not included in your template, it will fail CI.

| Required?         | Package.json key               | Description                                                                                   | Example                                                                                                                |
| ----------------- | ------------------------------ | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| ✅                | `name`                         | Kebab-case name of your template, should match directory                                      | durable-chat-template                                                                                                  |
| ✅                | `description`                  | Brief, one-line description of the template                                                   | Chat with other users in real-time using Durable Objects and PartyKit.                                                 |
| ✅                | `cloudflare`                   | Object you will nest all cloudflare-specific keys in                                          |                                                                                                                        |
| _if publish=true_ | `cloudflare.label`             | Title Case version of name for use in Cloudflare's dashboard                                  | Durable Chat App                                                                                                       |
| _if publish=true_ | `cloudflare.products`          | List <3 products featured in your example                                                     | ["D1", "Durable Objects"]                                                                                              |
| ❌                | `cloudflare.categories`        | String(s) that map to filter(s) in the template gallery view                                  | ["starter", "storage"]                                                                                                 |
| _if publish=true_ | `cloudflare.icon_urls`         | Link to icons to make visible on the template card                                            | https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/5ca0ca32-e897-4699-d4c1-6b680512f000/public (default TypeScript logo) |
| _if publish=true_ | `cloudflare.preview_image_url` | 16:9 aspect screenshot of the template application                                            | (Link will be provided during PR review)                                                                               |
| ❌                | `cloudflare.publish`           | Boolean to opt-in for a dashboard feature - leave out unless requested by the Cloudflare team | (Primarily for internal contributor use)                                                                               |

### Best Practices: package.json

- **`cloudflare.products`** - Do not exceed 3 product listed, this section of the card component does not overflow nicely. Focus on highlighting the most unique products featured in your template (e.g. majority of our templates leverage 'Worker Assets' in some capacity, but only a select few feature 'DO').
- **`cloudflare.categories`**
  - Today, categories are optional to include. In the future, we will support filters in the templates gallery at which point this will become a new template requirement.
  - Only the following categories are supported: `"starter"`, `"storage"`, and `"ai"`. Anything outside of this set will be rejected by CI.
- **`cloudflare.preview_image_url`**
  - Can only be provided by a Cloudflare team member. Image files for icons and preview images are stored in the Cloudflare Templates CF account.
  - Preview image should be a screenshot of the application running in-browser.
- **`cloudflare.icon_urls`** - Icon image should be a png of any logos you want to appear on the templates card (most commonly TypeScript, in which case you can use [this URL](https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/5ca0ca32-e897-4699-d4c1-6b680512f000/public)).

### Package-lock.json

All of our templates and Deploy to Cloudflare projects automatically set up Workers CI. In our testing, including a package lock file in the template repository speeds up module resolution by 80% or more.

To generate a package-lock.json for your template, run this command in the root of the repository:

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
This content will NOT be included in the template details page

<!-- dash-content-start -->

This content will be included in Template Details Page

<!-- dash-content-end -->

This content will NOT be included in the template detail page
```

### Secrets & Environment Variables

For both Secrets and Env Vars, we recommend letting your users know if any configuration is missing directly in the deployed application's UI. See [this example](https://saas-admin-template.templates.workers.dev/admin) from a current template.

#### Secrets

Today, there is no standard way to derive the required secrets from a project’s repository. Please include a section in your ReadMe listing all required secrets for your template and where users should go to find the appropriate values.

#### Environment Variables

Environment Variables that do not require user updates will automatically be included in the new project (e.g. `“ENVIRONMENT”: “staging”`). Environment variables that require user updates (e.g. `“PROJECT_ID”: “[your project id]”`) will need to be configured after initial deployment by following the documentation for [Environment Variables](https://developers.cloudflare.com/workers/configuration/environment-variables) and [Secrets](https://developers.cloudflare.com/workers/configuration/secrets).

## Checklist

The above requirements, distilled into checklist form:

- [ ] Confirm your template is working as expected, both locally and deployed
- [ ] Write a clear, concise, and helpful ReadMe - Use a developer-oriented tone; provide neither too much nor too little detail
- [ ] Designate which section of content should be displayed in the Cloudflare Dashboard by wrapping it in <!-- dash-content-start --> and <!-- dash-content-end -->
- [ ] Include a link to the publicly-accessible deployed preview in your ReadMe
- [ ] Include required metadata in package.json (name, description, cloudflare.label, cloudflare.products, cloudflare.icon_urls, cloudflare.preview_image_url)
- [ ] Include the most up-to-date package lock file
- [ ] Include a preview image of the application (16:9 aspect ratio, >=500px width) in your template assets
- [ ] Open a PR against the public repository's main branch
