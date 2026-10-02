# React + Vite + Cloudflare Workers

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/react-starter-template)

A React SPA with a Workers API, built with Vite and the Cloudflare Vite plugin.

![React + TypeScript + Vite + Cloudflare Workers](https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/fc7b4b62-442b-4769-641b-ad4422d74300/public)

<!-- dash-content-start -->

Build a full-stack app on Cloudflare Workers with:

- [**React**](https://react.dev/) — UI library for interactive interfaces
- [**Vite**](https://vite.dev/) — build tooling and dev server
- [**Cloudflare Workers**](https://developers.cloudflare.com/workers/) — edge compute for your API and static assets

### Key features

- Hot Module Replacement (HMR) for client and Worker code
- TypeScript support
- Workers API via a `fetch` handler in `worker/index.ts`
- SPA asset routing with Workers Assets
- Built-in observability

This matches the scaffold from `npm create cloudflare@latest -- my-app --framework=react`. For React + [Hono](https://hono.dev/), see [`vite-react-template`](https://github.com/cloudflare/templates/tree/main/vite-react-template).

<!-- dash-content-end -->

## Getting started

```bash
npm create cloudflare@latest -- --template=cloudflare/templates/react-starter-template
```

Or:

```bash
npm create cloudflare@latest -- my-react-app --framework=react
```

## Development

```bash
npm install
npm run dev
```

App: [http://localhost:5173](http://localhost:5173).

## Production

```bash
npm run build
npm run preview
npm run deploy
```

## Resources

- [React + Vite framework guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/)
- [Cloudflare Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/)
- [Workers documentation](https://developers.cloudflare.com/workers/)
