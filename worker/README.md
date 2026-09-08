# Hilltoppers Worker

The only server-side code in the project. Two APIs live here:

- **`POST /api/ask`** — the Ask box in the extension popup. Answers questions
  about the school from its own documents. Live.
- **`/api/ideas`** — the ideas board. **Paused** on the client side: the
  extension's Ideas section is behind `IDEAS_ENABLED = false` in
  `chrome-extension/src/services/ideasService.ts`, and the site in
  `ideas-site/` is paused too. Nothing here is broken. To resume, flip that one
  flag and follow the steps in its comment.

Schedule data does not go through here: it is static JSON in `data/public/`,
served from Cloudflare Pages and read directly by the iOS app and the extension.

The Worker is deployed under its historical name `schedule-admin-api`.
Renaming it changes its URL, which the extension has baked in, so that is a
separate change.

## Ask

`POST /api/ask` with `{"question": "..."}` returns
`{"answer": "...", "sources": [{"n", "title", "url", "date", "kind"}]}`.
Works signed out; a Firebase token, when sent, only changes how the daily cap
(40 questions) is counted — per account instead of per IP.

How it answers, in `src/ask.ts`:

1. DeepSeek rewrites the question (any language) into English search terms
   and decides whether it is about something dated.
2. BM25 (`src/retrieval.ts`) over `corpus.json` — the Daily Bulletin archive,
   SJA News issues, the student handbook, the dress code page — picks about
   ten passages. Dated questions always get the newest bulletin too.
3. DeepSeek answers from those passages plus the next six weeks of the
   official events feed, citing passages as `[n]`; the cited passages become
   the source links in the popup.

There is no vector database on purpose: the corpus is a few hundred KB and
the questions are full of proper nouns that keyword search handles well. If
recall ever becomes the problem, the place to add embeddings is
`retrieval.ts`, and nothing else changes.

The documents come from `data/scripts/fetch_corpus.mjs`, which a GitHub
Action runs a few times a day. Adding a source means editing
`data/corpus_sources.json`, not this Worker.

Setup for this endpoint is one secret:

```bash
npx wrangler secret put DEEPSEEK_API_KEY   # from platform.deepseek.com
npx wrangler deploy
```

Until the secret exists the endpoint answers 503 and the popup shows
"Ask is not set up on this server yet." The model id is the `DEEPSEEK_MODEL`
var in `wrangler.toml` (`deepseek-v4-flash`; the old `deepseek-chat` name was
retired in July 2026 and fails).

Every question is logged as one JSON line with the retrieval score and
whether anything was cited. `npm run tail` while people use it is how you find
out which questions the documents cannot answer yet — and therefore which
source to add next.

To try it locally without a DeepSeek key, `wrangler dev` accepts overrides:
`--var DEEPSEEK_URL:http://localhost:9999/chat/completions` pointing at any
OpenAI-shaped mock, plus `CORPUS_URL` / `EVENTS_URL` / `DAY_TYPE_URL` for a
local copy of `data/public/`. `npm test` runs the retrieval tests.

## Ideas board

Students vote on and submit feature ideas without needing a GitHub account.
Each idea is a GitHub issue; this Worker holds the votes, because a reaction
added with the bot token is attributed to that one account and would never
count past one.

### Setup

Everything mechanical is in one script. Run it from this directory:

```bash
npm install
npm run setup:ideas
```

It creates the D1 database, writes its id into `wrangler.toml`, creates the
votes table, prompts for the GitHub token if it is missing, deploys, and then
calls the live endpoint to prove it works. Re-running it is safe — every step
checks whether it already happened.

The only thing you need in hand is a fine-grained GitHub token with
**Issues: Read and write** on `daniezl/Hilltoppers` and nothing else. The
script tells you when to paste it.

Both clients — the extension's Ideas section and the website in
`ideas-site/` — are paused. Nothing calls this API until one of them is
switched back on.

### Moderation

No review queue and no admin screen — it rides on the `enhancement` label:

- The board shows issues labelled `enhancement`.
- Submissions are created **with no labels**, so they stay invisible.
- Approve by adding the label in the GitHub UI; reject by deleting the issue.

Status is read off GitHub as well: `wontfix` → Not right now, closed → Done,
assignee → Being built, otherwise Open for votes.

> Do not create an issue template with `enhancement` in its `labels:` field.
> Templates apply labels regardless of who opens the issue, which would put
> unreviewed issues straight onto the board.

### Ideas endpoints

- `GET /api/ideas` — list; works signed out, and reports `hasVoted` when a
  token is sent
- `POST /api/ideas` — submit (signed in, verified email, 3 per day)
- `POST` / `DELETE /api/ideas/:number/vote` — vote and un-vote
- `GET /api/ideas/health` — what this build can reach; 200 when all of it, 503
  otherwise

### When everything says "Please sign in first"

That message is what the API returns whenever it cannot verify a token, so a
Worker that has lost access to Firebase's signing keys is indistinguishable
from a genuinely signed-out visitor, and the obvious place to look is the
client, which will be fine. Check the Worker first:

```
curl https://schedule-admin-api.danielzhang089.workers.dev/api/ideas/health
```

`firebaseKeys.url` is worth reading even when it says `ok`, because it tells
you which build is actually live. The keys are published at
`…/service_accounts/v1/jwk/…`; the plural `jwks` is a 404, and pointing at it
rejects every token while looking like an auth problem.

A signed-out `GET /api/ideas` returning ideas normally while every vote comes
back 401 is the same symptom seen from the other side: listing does not need a
token, so it keeps working.

These are public routes; do not put them behind Cloudflare Access.

### Sign-in methods

Email and password only, matching the extension. Google is enabled on the
Firebase project and would work on a web page, but adding it anywhere before
the extension has it would split accounts: a Google sign-in gets a different
uid from the password account holding that person's votes. Apple is not usable
at all — the project answers `OPERATION_NOT_ALLOWED : Code flow is not enabled
for Apple`.
