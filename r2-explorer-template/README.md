# R2-Explorer App

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/r2-explorer-template)

![Worker + D1 Template Preview](TODO)

<!-- dash-content-start -->

R2-Explorer brings a familiar Google Drive-like interface to your Cloudflare R2 storage buckets, making file management simple and intuitive.

## Key Features

- **🔒 Security**

  - Basic Authentication support
  - Cloudflare Access integration
  - Self-hosted on your Cloudflare account

- **📁 File Management**

  - Drag-and-drop file upload
  - Folder creation and organization
  - Multi-part upload for large files
  - Right-click context menu for advanced options
  - HTTP/Custom metadata editing

- **👀 File Handling**
  - In-browser file preview
    - PDF documents
    - Images
    - Text files
    - Markdown
    - CSV
    - Logpush files
  - In-browser file editing
  - Folder upload support
- **📧 Email Integration**
  - Receive and process emails via Cloudflare Email Routing
  - View email attachments directly in the interface

> [!IMPORTANT]
> When using C3 to create this project, select "no" when it asks if you want to deploy. You need to follow this project's [setup steps](https://github.com/cloudflare/templates/tree/main/r2-explorer-template#setup-steps) before deploying.

<!-- dash-content-end -->

## Getting Started

Outside of this repo, you can start a new project with this template using [C3](https://developers.cloudflare.com/pages/get-started/c3/) (the `create-cloudflare` CLI):

```
npm create cloudflare@latest -- --template=cloudflare/templates/r2-explorer-template
```

A live public deployment of this template is available at [https://demo.r2explorer.com](https://demo.r2explorer.com)

## Setup Steps

1. Install the project dependencies with a package manager of your choice:
   ```bash
   npm install
   ```
2. Create a [R2 Bucket](https://developers.cloudflare.com/r2/get-started/) with the name "r2-explorer-bucket":
   ```bash
   npx wrangler r2 bucket create r2-explorer-bucket
   ```
3. Deploy the project!
   ```bash
   npx wrangler deploy
   ```

## Next steps

By default this template is **readonly**.

in order for you to enable editing, just update the `readonly` flag in your `src/index.ts` file.

Its highly recommended that you setup security first, [learn more here](https://r2explorer.com/getting-started/security/).
