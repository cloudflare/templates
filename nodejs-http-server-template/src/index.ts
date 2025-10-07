import { httpServerHandler } from "cloudflare:node";
import { createServer } from "node:http";

// Create your Node.js HTTP server
const server = createServer((req, res) => {
	if (req.url === "/") {
		res.writeHead(200, { "Content-Type": "text/html" });
		res.end("<h1>Welcome to my Node.js app on Workers!</h1>");
	} else if (req.url === "/api/status") {
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ status: "ok", timestamp: Date.now() }));
	} else {
		res.writeHead(404, { "Content-Type": "text/plain" });
		res.end("Not Found");
	}
});

server.listen(8080);

// Export the server as a Workers handler
export default httpServerHandler({ port: 8080 });
