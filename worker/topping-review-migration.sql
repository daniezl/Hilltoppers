ALTER TABLE toppings ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
UPDATE toppings SET status='approved';
CREATE TABLE IF NOT EXISTS topping_images (topping_id TEXT PRIMARY KEY REFERENCES toppings(id), mime TEXT NOT NULL, data TEXT NOT NULL);
