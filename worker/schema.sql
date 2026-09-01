-- Ideas board vote storage.
--
-- Apply with:
--   npx wrangler d1 execute hilltoppers-ideas --file=schema.sql --remote
--
-- The composite primary key is the entire "one vote per account" rule; a repeat
-- INSERT OR IGNORE is silently dropped. No extra index on issue_number is
-- needed because it is the leading column of that key.

CREATE TABLE IF NOT EXISTS votes (
  issue_number INTEGER NOT NULL,
  uid          TEXT    NOT NULL,
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (issue_number, uid)
);
