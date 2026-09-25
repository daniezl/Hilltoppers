ALTER TABLE toppings ADD COLUMN icon TEXT NOT NULL DEFAULT 'sparkle';
UPDATE toppings SET icon='chat' WHERE id='ask-sja';
