interface Env {
	DB: D1Database;
	DRAFTS: KVNamespace;
	ASSETS: Fetcher;
}

type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {}
}
