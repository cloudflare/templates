-- X post IDs exceed JavaScript safe integers, so they stay TEXT. Sort them with CAST.
CREATE TABLE posts (
	query TEXT NOT NULL,
	id TEXT NOT NULL,
	text TEXT NOT NULL,
	author_username TEXT NOT NULL,
	author_name TEXT NOT NULL,
	created_at TEXT NOT NULL,
	like_count INTEGER NOT NULL,
	repost_count INTEGER NOT NULL,
	reply_count INTEGER NOT NULL,
	fetched_at TEXT NOT NULL,
	PRIMARY KEY (query, id)
);

CREATE INDEX posts_newest_first ON posts (query, CAST(id AS INTEGER) DESC);

CREATE TABLE sync_status (
	id INTEGER PRIMARY KEY CHECK (id = 1),
	outcome TEXT NOT NULL,
	ran_at TEXT NOT NULL
);
