import { Hono } from "hono";

function isPlaceholderAddress(value: string): boolean {
	return /@[a-z0-9.-]+\.example$/i.test(value.trim());
}

async function renderSetupPage(request: Request, env: Env): Promise<Response> {
	const response = await env.ASSETS.fetch(request);
	if (!response.ok) {
		return response;
	}

	const endpoint = `${new URL(request.url).origin}/send`;
	const showWarning =
		!env.FROM_ADDRESS.trim() ||
		!env.TO_ADDRESS.trim() ||
		isPlaceholderAddress(env.FROM_ADDRESS) ||
		isPlaceholderAddress(env.TO_ADDRESS);

	return new HTMLRewriter()
		.on("#from-address", {
			element(element) {
				element.setInnerContent(env.FROM_ADDRESS);
			},
		})
		.on("#to-address", {
			element(element) {
				element.setInnerContent(env.TO_ADDRESS);
			},
		})
		.on("#send-endpoint", {
			element(element) {
				element.setInnerContent(endpoint);
			},
		})
		.on("#configuration-warning", {
			element(element) {
				if (!showWarning) {
					element.remove();
				}
			},
		})
		.transform(response);
}

export const app = new Hono<{ Bindings: Env }>();

app.get("/", (context) => renderSetupPage(context.req.raw, context.env));

app.use("/send", async (context, next) => {
	await next();
	context.header("Cache-Control", "no-store");
});

app.post("/send", async (context) => {
	const authToken = context.env.SEND_EMAIL_AUTH_TOKEN?.trim();
	if (!authToken) {
		return context.json({ error: "Email sending is not configured" }, 503);
	}

	if (context.req.header("authorization") !== `Bearer ${authToken}`) {
		context.header("WWW-Authenticate", "Bearer");
		return context.json({ error: "Unauthorized" }, 401);
	}

	const from = context.env.FROM_ADDRESS.trim();
	const to = context.env.TO_ADDRESS.trim();
	if (!from || !to || isPlaceholderAddress(from) || isPlaceholderAddress(to)) {
		return context.json({ error: "Email addresses are not configured" }, 503);
	}

	try {
		// Sender and recipient come only from bindings, so request data cannot turn
		// this authenticated endpoint into an arbitrary email relay.
		const result = await context.env.EMAIL.send({
			from,
			to,
			subject: "Hello from Cloudflare Email Service",
			html: "<h1>Your Email Sending Worker is ready</h1><p>This message was sent with the Cloudflare Email Service binding.</p>",
			text: "Your Email Sending Worker is ready. This message was sent with the Cloudflare Email Service binding.",
		});

		return context.json({ success: true, messageId: result.messageId });
	} catch (error) {
		console.error("Email sending failed", error);
		return context.json({ error: "Email could not be sent" }, 502);
	}
});

app.all("/send", (context) => {
	context.header("Allow", "POST");
	return context.json({ error: "Method not allowed" }, 405);
});

app.notFound((context) => context.env.ASSETS.fetch(context.req.raw));

export function handleRequest(request: Request, env: Env): Promise<Response> {
	return Promise.resolve(app.fetch(request, env));
}

export default app;
