
CREATE TABLE IF NOT EXISTS topping_revisions (topping_id TEXT PRIMARY KEY REFERENCES toppings(id), payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending');
