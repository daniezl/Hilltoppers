CREATE TABLE IF NOT EXISTS toppings (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
 url TEXT NOT NULL, image TEXT NOT NULL, author_uid TEXT NOT NULL,
 author TEXT NOT NULL, graduation_year INTEGER, created_at INTEGER NOT NULL,
 hidden INTEGER NOT NULL DEFAULT 0, icon TEXT NOT NULL DEFAULT 'sparkle', status TEXT NOT NULL DEFAULT 'pending'
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

CREATE TABLE IF NOT EXISTS topping_images (topping_id TEXT PRIMARY KEY REFERENCES toppings(id), mime TEXT NOT NULL, data TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS topping_revisions (topping_id TEXT PRIMARY KEY REFERENCES toppings(id), payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending');
