import "hono";

declare module "hono" {
	interface ExecutionContext {
		readonly access?: CloudflareAccessContext;
	}
}
