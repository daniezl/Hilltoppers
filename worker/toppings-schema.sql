CREATE TABLE IF NOT EXISTS toppings (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
 url TEXT NOT NULL, image TEXT NOT NULL, author_uid TEXT NOT NULL,
 author TEXT NOT NULL, graduation_year INTEGER, created_at INTEGER NOT NULL,
 hidden INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS topping_users (
 topping_id TEXT NOT NULL REFERENCES toppings(id), uid TEXT NOT NULL,
 PRIMARY KEY(topping_id, uid)
);
CREATE TABLE IF NOT EXISTS topping_ratings (
 topping_id TEXT NOT NULL REFERENCES toppings(id), uid TEXT NOT NULL,
 stars INTEGER NOT NULL CHECK(stars BETWEEN 1 AND 5),
 PRIMARY KEY(topping_id, uid)
);
CREATE TABLE IF NOT EXISTS topping_reports (
 topping_id TEXT NOT NULL REFERENCES toppings(id), uid TEXT NOT NULL,
 reason TEXT NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(topping_id, uid)
);
INSERT INTO toppings VALUES (
 'ask-sja', 'Ask SJA', 'Answers about school life, with sources you can check.',
 'https://ask-sja-topping.danielzhang089.workers.dev/',
 'builtin:ask-sja', 'hilltoppers', 'Yaoyu Zhang', 2027, 1789603200000, 0
)
ON CONFLICT(id) DO UPDATE SET
 author = excluded.author,
 graduation_year = excluded.graduation_year;
