-- Migration: Create blog posts table
-- This table stores blog posts created through the editor

CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    content TEXT NOT NULL, -- BlockNote JSON content
    html_content TEXT, -- Rendered HTML for display
    slug TEXT UNIQUE NOT NULL,
    hero_image TEXT,
    pub_date TEXT NOT NULL, -- ISO 8601 format
    updated_date TEXT, -- ISO 8601 format
    status TEXT NOT NULL DEFAULT 'draft', -- 'draft' or 'published'
    author TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_pub_date ON posts(pub_date DESC);

-- Table for storing post tags (optional, for future use)
CREATE TABLE IF NOT EXISTS post_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id TEXT NOT NULL,
    tag TEXT NOT NULL,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_post_tags_post_id ON post_tags(post_id);
CREATE INDEX IF NOT EXISTS idx_post_tags_tag ON post_tags(tag);
