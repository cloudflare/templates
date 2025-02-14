# React + Vite + Hono + Cloudflare Workers

This template provides a minimal setup for building a React application with TypeScript and Vite, designed to run on Cloudflare Workers. It features hot module replacement, ESLint integration, and the flexibility of Workers deployments.

![React + TypeScript + Vite + Cloudflare Workers](https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/fc7b4b62-442b-4769-641b-ad4422d74300/public)

<!-- dash-content-start -->

[React](https://react.dev/) + [Vite](https://vite.dev/) meets [Hono](https://hono.dev/) + [Cloudflare Workers](https://developers.cloudflare.com/workers/). Kickstart your project with local development or deploy directly via the Cloudflare dashboard.

<!-- dash-content-end -->

## Getting Started

To start a new project with this template, run:

```bash
npm create cloudflare@latest -- --template=cloudflare/templates/vite-react-template
```

A live deployment of this template is available at:
[https://react-vite-template.templates.workers.dev](https://react-vite-template.templates.workers.dev)

## Development

Install dependencies:

```bash
npm install
```

Start the development server with:

```bash
npm run dev
```

Your application will be available at [http://localhost:5173](http://localhost:5173).

## Production

Build your project for production:

```bash
npm run build
```

Preview your build locally:

```bash
npm run preview
```

Deploy your project to Cloudflare Workers:

```bash
npx wrangler deploy
```

## Additional Resources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Vite Documentation](https://vitejs.dev/guide/)
- [React Documentation](https://reactjs.org/)
