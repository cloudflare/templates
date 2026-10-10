import { createBoundaObject, createWorker } from "@bounda-dev/cloudflare";
import { registry } from "../.bounda/registry.ts";
import config from "../bounda.config.ts";

/**
 * The Durable Object class bound as STORE in wrangler.jsonc. Each instance is one store, with
 * everything it keeps in the object's own SQLite. A command updates the read models before it
 * answers; policies, processes and scheduled commands run later, in the object's alarm, which it
 * arms itself.
 */
export const Store = createBoundaObject({ registry, config });

/**
 * The Worker in front: a JSON API that routes each request to the tenant's object, picked by
 * the `x-bounda-tenant` header, over RPC. It has no authentication; an app with users writes its
 * own `fetch` and calls the object through `connect(env.STORE.get(id))`.
 */
export default createWorker({
	config,
	tenantOf: (request) => request.headers.get("x-bounda-tenant") ?? "default",
});
