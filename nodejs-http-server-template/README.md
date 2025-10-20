# Node.js HTTP Server Template for Cloudflare Workers

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/templates/tree/main/nodejs-http-server-template)

<!-- dash-content-start -->

A simple Node.js HTTP server template using the built-in `node:http` module, designed to run on Cloudflare Workers.

<!-- dash-content-end -->

## Quick Start

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Run locally:**

   ```bash
   npm run dev
   ```

3. **Deploy to Cloudflare Workers:**
   ```bash
   npx wrangler deploy
   ```

## Usage

The template creates a basic HTTP server:

```javascript
import { createServer } from "node:http";
import { httpServerHandler } from "cloudflare:node";

const server = createServer((req, res) => {
	res.writeHead(200, { "Content-Type": "text/plain" });
	res.end("Hello from Node.js HTTP server!");
});

server.listen(8080);
export default httpServerHandler({ port: 8080 });
```

## Configuration

The `wrangler.toml` includes the necessary compatibility flags:

```toml
compatibility_flags = ["nodejs_compat"]
compatibility_date = "2025-09-03"
```

## Scripts

- `npm start` - Start the server
- `npm run dev` - Start with hot reload
- `npm test` - Run tests

## Learn More

- [Cloudflare Workers Node.js HTTP Documentation](https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/)
- [Node.js HTTP Module](https://nodejs.org/api/http.html)

## License

MIT
