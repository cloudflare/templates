import { Retries } from "durable-utils";

export type Env = {
	DB01: D1Database;
};

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);

		// A. Create the Session.
		// When we create a D1 Session, we can continue where we left off from a previous
		// Session if we have that Session's last bookmark or use a constraint.
		const bookmark =
			request.headers.get("x-d1-bookmark") ?? "first-unconstrained";
		const session = env.DB01.withSession(bookmark);

		try {
			// Use this Session for all our Workers' routes.
			const response = await withTablesInitialized(
				request,
				session,
				handleRequest,
			);

			// B. Return the bookmark so we can continue the Session in another request.
			response.headers.set("x-d1-bookmark", session.getBookmark() ?? "");

			return response;
		} catch (e) {
			console.error({
				message: "Failed to handle request",
				error: String(e),
				errorProps: e,
				url,
				bookmark,
			});
			return Response.json(
				{ error: String(e), errorDetails: e },
				{ status: 500 },
			);
		}
	},
} satisfies ExportedHandler<Env>;

type Order = {
	orderId: string;
	customerId: string;
	quantity: number;
};

async function handleRequest(request: Request, session: D1DatabaseSession) {
	const { pathname } = new URL(request.url);

	const tsStart = Date.now();

	if (request.method === "GET" && pathname === "/api/orders") {
		// C. Session read query.
		return await Retries.tryWhile(async () => {
			const resp = await session.prepare("SELECT * FROM Orders").all();
			return Response.json(buildResponse(session, resp, tsStart));
		}, shouldRetry);
	} else if (request.method === "POST" && pathname === "/api/orders") {
		const order = await request.json<Order>();

		return await Retries.tryWhile(async () => {
			// D. Session write query.
			// Since this is a write query, D1 will transparently forward the query.
			await session
				.prepare("INSERT INTO Orders VALUES (?, ?, ?) ON CONFLICT DO NOTHING")
				.bind(order.customerId, order.orderId, order.quantity)
				.run();

			// E. Session read-after-write query.
			// In order for the application to be correct, this SELECT
			// statement must see the results of the INSERT statement above.
			const resp = await session.prepare("SELECT * FROM Orders").all();

			return Response.json(buildResponse(session, resp, tsStart));
		}, shouldRetry);
	} else if (request.method === "POST" && pathname === "/api/reset") {
		return await Retries.tryWhile(async () => {
			const resp = await resetTables(session);
			return Response.json(buildResponse(session, resp, tsStart));
		}, shouldRetry);
	}

	return new Response("Not found", { status: 404 });
}

function buildResponse(
	session: D1DatabaseSession,
	res: D1Result,
	tsStart: number,
) {
	return {
		d1Latency: Date.now() - tsStart,

		results: res.results,
		servedByRegion: res.meta.served_by_region ?? "",
		servedByPrimary: res.meta.served_by_primary ?? "",

		// Add the session bookmark inside the response body too.
		sessionBookmark: session.getBookmark(),
	};
}

function shouldRetry(err: unknown, nextAttempt: number) {
	const errMsg = String(err);
	const isRetryableError =
		errMsg.includes("Network connection lost") ||
		errMsg.includes("storage caused object to be reset") ||
		errMsg.includes("reset because its code was updated");
	if (nextAttempt <= 5 && isRetryableError) {
		return true;
	}
	return false;
}

/**
 * This is mostly for DEMO purposes to avoid having to do separate schema migrations step.
 * This will check if the error is because our main table is missing, and if it is create the table
 * and rerun the handler.
 */
async function withTablesInitialized(
	request: Request,
	session: D1DatabaseSession,
	handler: (request: Request, session: D1DatabaseSession) => Promise<Response>,
) {
	// We use clones of the body since if we parse it once, and then retry with the
	// same request, it will fail due to the body stream already being consumed.
	try {
		return await handler(request.clone(), session);
	} catch (e) {
		if (String(e).includes("no such table: Orders: SQLITE_ERROR")) {
			await initTables(session);
			return await handler(request.clone(), session);
		}
		throw e;
	}
}

async function initTables(session: D1DatabaseSession) {
	return await session
		.prepare(
			`CREATE TABLE IF NOT EXISTS Orders(
			customerId TEXT NOT NULL,
			orderId TEXT NOT NULL,
			quantity INTEGER NOT NULL,
			PRIMARY KEY (customerId, orderId)
		)`,
		)
		.all();
}

async function resetTables(session: D1DatabaseSession) {
	return await session
		.prepare(
			`DROP TABLE IF EXISTS Orders; CREATE TABLE IF NOT EXISTS Orders(
			customerId TEXT NOT NULL,
			orderId TEXT NOT NULL,
			quantity INTEGER NOT NULL,
			PRIMARY KEY (customerId, orderId)
		)`,
		)
		.all();
}
