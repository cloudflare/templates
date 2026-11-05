import { brust } from "@brust/core/elysia";
import { Elysia, t } from "elysia";

// One Elysia 2 app, served by the Rust server under /_brust/action (brust.toml [actions]).
// Elysia 2 takes (path, hook, handler). Never call app.listen(): Rust owns HTTP.
const app = new Elysia({ adapter: brust() })
	.get(
		"/hello",
		{ query: t.Object({ name: t.Optional(t.String()) }) },
		({ query }) => ({ message: `Hello, ${query.name ?? "world"}!` }),
	)
	// A body that fails the schema answers 422 before the handler runs.
	.post(
		"/greet",
		{ body: t.Object({ name: t.String({ minLength: 1, maxLength: 40 }) }) },
		({ body }) => ({
			message: `Hello, ${body.name}!`,
			at: new Date().toISOString(),
		}),
	);

export default app;
export type App = typeof app;
