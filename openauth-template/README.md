# OpenAuth Server

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/openauth-template)

![OpenAuth Template Preview](https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/b2ff10c6-8f7c-419f-8757-e2ccf1c84500/public)

<!-- dash-content-start -->

[OpenAuth](https://openauth.js.org/) is a universal provider for managing user authentication. By deploying OpenAuth on Cloudflare Workers, you can add scalable authentication to your application. This demo showcases multiple authentication methods including Google OAuth, email/code login, and password-based authentication, with storage and state powered by [D1](https://developers.cloudflare.com/d1/) and [KV](https://developers.cloudflare.com/kv/). [Observability](https://developers.cloudflare.com/workers/observability/logs/workers-logs/#enable-workers-logs) is on by default.

## Authentication Methods

This template includes three authentication providers:

1. **Google OAuth** - Sign in with Google account
2. **Code (PIN)** - Email-based authentication with verification codes
3. **Password** - Traditional email and password authentication

> [!IMPORTANT]
> When using C3 to create this project, select "no" when it asks if you want to deploy. You need to follow this project's [setup steps](https://github.com/cloudflare/templates/tree/main/openauth-template#setup-steps) before deploying.

<!-- dash-content-end -->

## Getting Started

Outside of this repo, you can start a new project with this template using [C3](https://developers.cloudflare.com/pages/get-started/c3/) (the `create-cloudflare` CLI):

```bash
npm create cloudflare@latest -- --template=cloudflare/templates/openauth-template
```

A live public deployment of this template is available at [https://openauth-template.templates.workers.dev](https://openauth-template.templates.workers.dev)

## Setup Steps

1. Install the project dependencies with a package manager of your choice:
   ```bash
   npm install
   ```

2. **Set up Google OAuth credentials** (required for Google sign-in):

   a. Go to the [Google Cloud Console](https://console.cloud.google.com/apis/credentials)

   b. Create a new project or select an existing one

   c. Navigate to "APIs & Services" > "Credentials"

   d. Click "Create Credentials" > "OAuth client ID"

   e. Configure the OAuth consent screen if prompted

   f. For Application type, select "Web application"

   g. Add authorized redirect URIs:
      - For local development: `http://localhost:8787/authorize/google/callback`
      - For production: `https://your-worker-url.workers.dev/authorize/google/callback`

   h. Copy your Client ID and Client Secret

3. **Configure environment variables**:

   For local development, create a `.dev.vars` file:
   ```bash
   cp .dev.vars.example .dev.vars
   ```

   Then edit `.dev.vars` and add your Google credentials:
   ```
   GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-google-client-secret
   ```

4. Create a [D1 database](https://developers.cloudflare.com/d1/get-started/) with the name "openauth-template-auth-db":
   ```bash
   npx wrangler d1 create openauth-template-auth-db
   ```
   ...and update the `database_id` field in `wrangler.json` with the new database ID.

5. Run the following db migration to initialize the database (notice the `migrations` directory in this project):
   ```bash
   npx wrangler d1 migrations apply --remote openauth-template-auth-db
   ```

6. Create a [kv namespace](https://developers.cloudflare.com/kv/get-started/) with a binding named "AUTH_STORAGE":
   ```bash
   npx wrangler kv namespace create AUTH_STORAGE
   ```
   ...and update the `kv_namespaces` -> `id` field in `wrangler.json` with the new namespace ID.

7. **Set production secrets** (before deploying):
   ```bash
   npx wrangler secret put GOOGLE_CLIENT_ID
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   ```
   You'll be prompted to enter the values for each secret.

8. Deploy the project!
   ```bash
   npx wrangler deploy
   ```

9. **Update Google OAuth redirect URIs** with your deployed Worker URL:
   - Go back to Google Cloud Console > Credentials
   - Edit your OAuth client
   - Add: `https://your-actual-worker-url.workers.dev/authorize/google/callback`

10. Monitor your worker:
    ```bash
    npx wrangler tail
    ```

## Using the Authentication Methods

Once deployed, users can authenticate using:

- **Google**: Click "Sign in with Google" button
- **Code**: Enter email to receive a verification code (check Worker logs for the code in development)
- **Password**: Register with email/password, then login with credentials

> **Note**: In the template, verification codes for email-based authentication (Code and Password providers) are logged to the console. In production, you should integrate with an email service like [Resend](https://resend.com/docs/send-with-cloudflare-workers) to actually send these codes to users.
