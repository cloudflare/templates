// Copyright (c) 2022 Cloudflare, Inc.
// Licensed under the APACHE LICENSE, VERSION 2.0 license found in the LICENSE file or at http://www.apache.org/licenses/LICENSE-2.0

import { WorkerArgs } from "./types";

/*
 * Available bindings -- defined in wrangler.toml
 */
export type Env = {
	dispatcher: Dispatcher;
	DB: object;
	DISPATCH_NAMESPACE_NAME: string;
	// These are auto-provisioned by the setup script - no user input needed
	ACCOUNT_ID?: string;
	DISPATCH_NAMESPACE_API_TOKEN?: string; // For dispatch namespace operations
	CLOUDFLARE_ZONE_ID?: string; // For custom hostname operations
	// User-configurable (optional)
	CUSTOM_DOMAIN?: string;
	FALLBACK_ORIGIN?: string;
	// Optional: API token with SSL permissions for custom hostname support
	CLOUDFLARE_API_TOKEN?: string;
};

interface Dispatcher {
	/*
	 * GET call on dispatcher
	 * scriptName: name of the script
	 * init: a request to init
	 * getOptions: to set custom limits on the dispatch worker
	 */
	get: (
		scriptName: string,
		args?: WorkerArgs,
		getOptions?: {
			limits?: { cpuMs?: number; memory?: number };
			outbound?: string;
		},
	) => Worker;
}

interface Worker {
	fetch: (request: Request) => Promise<Response>;
}
