-- Migration number: 0001 	 2024-12-27T22:04:18.794Z
CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY NOT NULL,
    author TEXT NOT NULL,
    content TEXT NOT NULL
);

-- Insert some sample data into our comments table.
INSERT INTO comments (author, content)
VALUES
    ('Kristian', 'Congrats!'),
    ('Serena', 'Great job!'),
    ('Max', 'Keep up the good work!')
;
