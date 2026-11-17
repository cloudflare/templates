# SaaS Admin Template

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/saas-admin-template)

> [!NOTE]
> This template is no longer maintained.

![SaaS Admin Template](https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/52b88668-0144-489c-dd02-fe620270ba00/public)

<!-- dash-content-start -->

A complete admin dashboard template built with Astro, Shadcn UI, and Cloudflare's developer stack. Quickly deploy a fully functional admin interface with customer and subscription management capabilities.

## Features

- 🎨 Modern UI built with Astro and Shadcn UI
- 🔐 Built-in API with token authentication
- 👥 Customer management
- 💳 Subscription tracking
- 🚀 Deploy to Cloudflare Workers
- 📦 Powered by Cloudflare D1 database
- ✨ Clean, responsive interface
- 🔍 Data validation with Zod

## Tech Stack

- Frontend: [Astro](https://astro.build)
- UI Components: [Shadcn UI](https://ui.shadcn.com)
- Database: [Cloudflare D1](https://developers.cloudflare.com/d1)
- Deployment: [Cloudflare Workers](https://workers.cloudflare.com)
- Validation: [Zod](https://github.com/colinhacks/zod)

> [!IMPORTANT]
> When using C3 to create this project, select "no" when it asks if you want to deploy. You need to follow this project's [setup steps](https://github.com/cloudflare/templates/tree/main/d1-template#setup-steps) before deploying.

<!-- dash-content-end -->

## Setup Steps

1. Install dependencies:

```bash
npm install
```

2. Set up your environment variables:

```bash
# Create a .dev.vars file for local development
cp .dev.vars.example .dev.vars
```

Add your API token:

```
API_TOKEN=your_token_here
```

_An API token is required to authenticate requests to the API. You should generate this before trying to run the project locally or deploying it._

3. Create a [D1 database](https://developers.cloudflare.com/d1/get-started/) with the name "admin-db":

```bash
npx wrangler d1 create admin-db
```

...and update the `database_id` field in `wrangler.json` with the new database ID.

4. Run the database migrations locally:

```bash
$ npm run db:migrate
```

Run the development server:

```bash
npm run dev
```

_If you're testing Workflows, you should run `npm run wrangler:dev` instead._

5. Build the application:

```bash
npm run build
```

6. Deploy to Cloudflare Workers:

```bash
npm run deploy
```

7. Run the database migrations remotely:

```bash
$ npm run db:migrate:remote
```

8. Set your production API token:

```bash
npx wrangler secret put API_TOKEN
```

## Usage

This project includes a read-only admin dashboard for customers and subscriptions, and an API with token authentication to create and read them via REST, returning JSON data.

The dashboard pages under `/admin` ask for a username and password. Sign in with the username `admin` and your `API_TOKEN` as the password. Until `API_TOKEN` is set, the dashboard is disabled.

It also includes a "Customer Workflow", built with [Cloudflare Workflows](https://developers.cloudflare.com/workflows). This workflow can be triggered via the REST API to do arbitrary actions in the background for any given user. See [`customer_workflow.ts`]() to learn more about what you can do in this workflow.
