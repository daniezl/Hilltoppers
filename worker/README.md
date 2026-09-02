# Hilltoppers Worker

The ideas board API, and the only server-side code in the project. Schedule
data does not go through here: it is static JSON in `hilltoppers-pages/data/`,
served from Cloudflare Pages and read directly by the iOS app and the extension.

The Worker is still deployed under its historical name `schedule-admin-api`.
Renaming it changes its URL, which the extension has baked in, so that is a
separate change.

Students vote on and submit feature ideas without needing a GitHub account.
Each idea is a GitHub issue; this Worker holds the votes, because a reaction
added with the bot token is attributed to that one account and would never
count past one.

## Setup

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

The companion website (`ideas-site/`) is paused; see its README. The popup is
the only client for now, so nothing beyond this script is needed.

## Moderation

No review queue and no admin screen — it rides on the `enhancement` label:

- The board shows issues labelled `enhancement`.
- Submissions are created **with no labels**, so they stay invisible.
- Approve by adding the label in the GitHub UI; reject by deleting the issue.

Status is read off GitHub as well: `wontfix` → Not right now, closed → Done,
assignee → Being built, otherwise Open for votes.

> Do not create an issue template with `enhancement` in its `labels:` field.
> Templates apply labels regardless of who opens the issue, which would put
> unreviewed issues straight onto the board.

## Ideas endpoints

- `GET /api/ideas` — list; works signed out, and reports `hasVoted` when a
  token is sent
- `POST /api/ideas` — submit (signed in, verified email, 3 per day)
- `POST` / `DELETE /api/ideas/:number/vote` — vote and un-vote
- `GET /api/ideas/health` — what this build can reach; 200 when all of it, 503
  otherwise

## When everything says "Please sign in first"

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

## Sign-in methods

Email and password only, matching the extension. Google is enabled on the
Firebase project and would work on a web page, but adding it anywhere before
the extension has it would split accounts: a Google sign-in gets a different
uid from the password account holding that person's votes. Apple is not usable
at all — the project answers `OPERATION_NOT_ALLOWED : Code flow is not enabled
for Apple`.
