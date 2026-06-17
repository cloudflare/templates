# Ìºê Altified Cloudflare Worker

The Altified Worker is a high-performance edge translation layer. It automatically detects, translates, and injects a language switcher into your website using the Altified API, ensuring a seamless multilingual experience with zero latency impact.

## Ì∫Ä One-Click Deployment

Click the button below to deploy this worker to your own Cloudflare account instantly.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/benedictowusu/worker)
---

## Ìª† Features

* **Full Page Translation:** Translates `<head>` metadata (titles, descriptions, OG tags) and `<body>` content.
* **Dynamic Language Switcher:** Injects a customizable floating language selector.
* **SEO Optimized:** Automatically adds `hreflang` tags and handles language-prefixed URLs (e.g., `/es/about`).
* **Edge Caching:** Uses Cloudflare's global cache to store translations for maximum speed.
* **Zero FOUC:** Built-in logic to prevent "Flash of Untranslated Content."

## Ì≥ã Prerequisites

Before clicking the deploy button, make sure you have:
1.  A **Cloudflare Account**.
2.  An **Altified API Key** (Get yours at [altified.com](https://altified.com)).
3.  The **Domain** name you intend to use (e.g., `example.com`).

## ‚öôÔ∏è Setup Instructions

1.  **Deploy:** Click the "Deploy to Cloudflare" button above.
2.  **Configure Variables:** During the setup process, Cloudflare will ask you to provide:
    * `ALTIFIED_API_KEY`: Your unique project key from Altified.
    * `DOMAIN`: Your website's root domain.
3.  **Routes:** After deployment, go to your Worker settings in the Cloudflare Dashboard and add a **Route** to map the worker to your site (e.g., `example.com/*`).

## Ì≥Ñ License
MIT License

Copyright (c) 2025 Altified

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
