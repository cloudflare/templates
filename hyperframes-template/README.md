# HyperFrames Video Rendering

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/hyperframes-template)

<!-- dash-content-start -->

A [HyperFrames](https://github.com/heygen-com/hyperframes) template that previews HTML video compositions in the browser and renders MP4s server-side using a [Cloudflare Container](https://developers.cloudflare.com/containers/) (Chromium + FFmpeg) and stores them in [R2](https://developers.cloudflare.com/r2/).

Demonstrates Worker-to-Container fetching via Durable Object bindings, streaming response bodies through the Worker into R2, and bundling sub-compositions into a single self-contained preview HTML at build time.

<!-- dash-content-end -->

Outside of this repo, you can start a new project with this template using [C3](https://developers.cloudflare.com/pages/get-started/c3/) (the `create-cloudflare` CLI):

```bash
npm create cloudflare@latest -- --template=cloudflare/templates/hyperframes-template
```

Cloudflare Containers requires a [Workers Paid](https://developers.cloudflare.com/workers/platform/pricing/) plan.

## Getting Started

```bash
npm install
npm run dev
```

`wrangler dev` runs the Worker locally and builds + runs the container against your local Docker daemon (Docker is required for local container dev). The browser preview works without Docker; only `/api/render` needs the container.

## Deploying To Production

| Command          | Action                                |
| :--------------- | :------------------------------------ |
| `npm run deploy` | Deploy your application to Cloudflare |

Deploying provisions a Worker, the `RenderContainer` Durable Object, and an R2 bucket (`hyperframes-renders`).

## What this template does

- **Preview** a bundled composition (`cloudflare-intro`) in the browser using `<hyperframes-player>`, the zero-dependency web component from `@hyperframes/player`.
- **Render** the composition to an MP4 by POSTing to `/api/render`. The Worker streams the composition to a Cloudflare Container running a pre-built image with Chromium + FFmpeg + HyperFrames, streams the rendered MP4 directly into R2, and returns a URL.

## Architecture

```
 Browser                       Worker                            Container DO (instance_type: standard-4)
┌──────────────────┐          ┌────────────────────────┐        ┌──────────────────────────────────┐
│ <hyperframes-    │  ─────▶  │ /api/render            │  ────▶ │ Node HTTP server (port 8080)     │
│  player>         │          │  - load files from     │        │  - writes files to /tmp/         │
│ preview iframe   │          │    ASSETS              │        │  - hyperframes render            │
│                  │          │  - POST → container    │        │    (Chromium + ffmpeg)           │
│                  │  ◀────   │  - stream → R2 bucket  │  ◀──── │  - streams mp4 in response       │
│                  │   url    │  - return /r/<key>     │   mp4  │                                  │
└──────────────────┘          └────────────────────────┘        └──────────────────────────────────┘
```

The renderer is **baked into the container image** at build time (Chromium libs via apt, `hyperframes` and `ffmpeg-static` via npm, `chrome-headless-shell` pre-downloaded), so a request just writes composition files to a tmp dir and runs the renderer. Container instances sleep after 10 minutes of inactivity (`sleepAfter` on the Container class).

## Authoring compositions

Authoring happens locally with the HyperFrames CLI:

```bash
npx hyperframes init my-video
cd my-video
npx hyperframes preview   # live-reload editor in your browser
```

Drop the result into `public/compositions/<your-name>/`, set `PREVIEW_COMPOSITION_DIR=compositions/<your-name>` when running build/deploy, and `scripts/build.mjs` regenerates the manifest and bundle.

## Learn More

- [HyperFrames repo](https://github.com/heygen-com/hyperframes) — the underlying open-source rendering framework
- [Cloudflare Containers docs](https://developers.cloudflare.com/containers/)
- [Cloudflare R2 docs](https://developers.cloudflare.com/r2/)
