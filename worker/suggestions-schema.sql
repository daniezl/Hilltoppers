CREATE TABLE IF NOT EXISTS public_suggestions (
 id TEXT PRIMARY KEY, message TEXT NOT NULL, author_uid TEXT NOT NULL,
 author TEXT NOT NULL, created_at INTEGER NOT NULL, request_id TEXT NOT NULL,
 UNIQUE(author_uid,request_id)
);
CREATE INDEX IF NOT EXISTS suggestions_newest ON public_suggestions(created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS suggestions_author_date ON public_suggestions(author_uid,created_at);
CREATE TABLE IF NOT EXISTS suggestion_votes (
 suggestion_id TEXT NOT NULL REFERENCES public_suggestions(id), uid TEXT NOT NULL,
 value INTEGER NOT NULL CHECK(value IN(-1,1)), PRIMARY KEY(suggestion_id,uid)
);
