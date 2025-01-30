# Text To Image App

![Text To Image Template Preview](https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/aa5d61fc-64f9-44ce-cb1f-8172c92c5800/public)

<!-- dash-content-start -->

Generate images based on text prompts using [Workers AI](https://developers.cloudflare.com/workers-ai/). In this example, going to the website will generate an image from the prompt "cyberpunk cat" using the `@cf/stabilityai/stable-diffusion-xl-base-1.0` model. Be patience while it takes up to several seconds to generate!

<!-- dash-content-end -->

## Getting Started

Outside of this repo, you can start a new project with this template using [C3](https://developers.cloudflare.com/pages/get-started/c3/) (the `create-cloudflare` CLI):

```bash
npm create cloudflare@latest -- --template=cloudflare/templates/text-to-image-template
```

A live public deployment of this template is available at [https://text-to-image-template.templates.workers.dev](https://text-to-image-template.templates.workers.dev)

## Setup Steps

1. Install the project dependencies with a package manager of your choice:
   ```bash
   npm install
   ```
2. Deploy the project!
   ```bash
   npx wrangler deploy
   ```
