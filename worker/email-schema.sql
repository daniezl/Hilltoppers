CREATE TABLE IF NOT EXISTS email_challenges (
  id TEXT PRIMARY KEY, email_hash TEXT NOT NULL, uid TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK(purpose IN ('reset','verify')), code_hash TEXT NOT NULL,
  action_code TEXT NOT NULL, expires INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS email_challenges_recipient ON email_challenges(email_hash,purpose);
CREATE TABLE IF NOT EXISTS email_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS school_links (uid TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, linked_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS school_codes (
 id TEXT PRIMARY KEY, uid TEXT NOT NULL, email_hash TEXT NOT NULL, email_sealed TEXT NOT NULL,
 code_hash TEXT NOT NULL, expires INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS school_codes_uid ON school_codes(uid);
