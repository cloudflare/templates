# Contributing

We welcome template contributions that help demonstrate the full-stack capabilities of the Workers platform. If you're unsure about whether a template would be a good fit for this repository, feel free to open an issue with a link or description of your template idea to get feedback before writing up a pull request.

We're especially interested in templates that use multiple binding or handler types together, such as [D1 databases](https://developers.cloudflare.com/d1/), [Workers AI](https://developers.cloudflare.com/workers-ai/), or [queue consumers](https://developers.cloudflare.com/queues/configuration/configure-queues/#consumer), just to name a few.

## CI Checks

Code formatting, linting, and all other checks are covered under the `check:ci` script. The `fix:ci` script will automatically fix as many of these issues as possible. If CI is failing on your pull request, running `npm run fix:ci` in the repository root may be able to fix all of your problems.
