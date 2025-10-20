export type Params = {
	query?: string;
	site?: string | string[];
	generate_mode?: "list" | "summarize" | "generate" | "none";
	streaming?: "true" | "false";
	prev?: string[];
	last_ans?: { title: string; url: string }[];
	item_to_remember?: string;
	model?: string;
	oauth_id?: string;
	thread_id?: string;
	display_mode?: "full" | (string & {});
};

export type MessageResponse = {
	message_type:
		| "api_version"
		| "query_analysis"
		| "decontextualized_query"
		| "remember"
		| "asking_sites"
		| "result_batch"
		| "summary"
		| "nlws"
		| "ensemble_result"
		| "chart_result"
		| "results_map"
		| "intermediate_message"
		| "complete"
		| "license"
		| "data_retention"
		| "error";
	query_id?: string;
	api_version?: string;
	decontextualized_query?: string;
	original_query?: string | string[];
	message?: string;
	license?: string;
	content?: string;
	results?: any[];
	answer?: string;
	items?: any[];
	html?: string;
	locations?: { title: string; address: string }[];
};

export type LicenseMessage = {
	message_type: "license";
	content: string;
	query_id?: string;
};

export type DataRetention = {
	message_type: "data_retention";
	content: "Data provided may be retained for up to 1 day.";
};

export type ResultBatch = {
	message_type: "result_batch";
	results: {
		url?: string;
		name?: string;
		site?: string;
		siteUrl?: string;
		score?: number;
		description?: string;
		schema_object?: any;
		ranking_type?: string;
	}[];
	query_id?: string;
};
export type ResultMap = {
	message_type: "results_map";
	results: {
		url?: string;
		name?: string;
		site?: string;
		siteUrl?: string;
		score?: number;
		description?: string;
		schema_object?: any;
		ranking_type?: string;
	}[];
	query_id?: string;
};
