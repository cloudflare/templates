CREATE TABLE IF NOT EXISTS jobs (
	id TEXT PRIMARY KEY,
	source_url TEXT NOT NULL,
	mode TEXT CHECK (mode IS NULL OR mode IN ('fast', 'basic', 'advanced')),
	status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'retrying', 'complete', 'failed')),
	result_json TEXT,
	error TEXT,
	processing_attempt INTEGER NOT NULL DEFAULT 0 CHECK (processing_attempt >= 0),
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs (status);
CREATE INDEX IF NOT EXISTS jobs_created_at_idx ON jobs (created_at DESC);
