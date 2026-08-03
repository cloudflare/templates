import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function createDb(d1: D1Database) {
	return drizzle(d1, { schema });
}

// Will be set per-request
let _db: ReturnType<typeof createDb>;
export function setDb(d1: D1Database) {
	_db = createDb(d1);
}
export { _db as db };
