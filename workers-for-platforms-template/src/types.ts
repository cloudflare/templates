// Copyright (c) 2022 Cloudflare, Inc.
// Licensed under the APACHE LICENSE, VERSION 2.0 license found in the LICENSE file or at http://www.apache.org/licenses/LICENSE-2.0

export type ResourceValues = string | number | boolean | null;
export type ResourceRecord = Record<string, ResourceValues>;

/**
 * Project represents a user-deployed website in the platform.
 * Each project corresponds to a Worker script in the dispatch namespace.
 */
export interface Project {
	id: string;
	name: string;
	subdomain: string;
	custom_hostname?: string | null; // Optional custom domain like "mystore.com"
	script_content: string;
	created_on: string;
	modified_on: string;
}

/**
 * Arguments passed to Worker scripts via the dispatcher.
 * Used for passing context or configuration to dispatched Workers.
 */
export interface WorkerArgs {
	[key: string]: unknown;
}
