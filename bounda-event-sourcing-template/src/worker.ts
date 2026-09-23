import {
	createBoundaObject,
	createWorker,
} from "@bounda-dev/adapter-cloudflare";
import { registry } from "../.bounda/registry.ts";
import config from "../bounda.config.ts";

/**
 * The Durable Object class bound as STORE in wrangler.jsonc. Each instance is one store: its
 * events, read models, scheduled commands and dead letters live in the object's own SQLite
 * (`ctx.storage.sql`). A command updates the read models before it answers; anything that reacts
 * to events later runs in the object's alarm, which it arms itself.
 */
export const Store = createBoundaObject({ registry, config });

/**
 * The Worker in front: a JSON API that routes each request to the tenant's object, picked by
 * the `x-bounda-tenant` header, over RPC. It has no authentication; an app with users writes its
 * own `fetch` and calls the object through `connect(env.STORE.get(id))`.
 */
export default createWorker({ binding: "STORE" });
