# Hilltoppers Worker

> **Paused.** The ideas board is switched off while the project is being
> restructured. The Worker may still be deployed — leaving it up costs nothing
> and keeps the votes in D1 — but no client calls it: the extension's Ideas
> section is behind `IDEAS_ENABLED = false` in
> `chrome-extension/src/services/ideasService.ts`, and the site in
> `ideas-site/` is paused too. Nothing here is broken. To resume, flip that one
> flag and follow the steps in its comment.

The ideas board API, and the only server-side code in the project. Schedule
data does not go through here: it is static JSON in `data/public/`,
served from Cloudflare Pages and read directly by the iOS app and the extension.

The Worker is deployed under its historical name `schedule-admin-api`.
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

Both clients — the extension's Ideas section and the website in
`ideas-site/` — are paused. Nothing calls this API until one of them is
switched back on.

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


## Topping Bar

This is a separate Worker (`hilltoppers-topping-bar`) and D1 database
(`hilltoppers-toppings`), configured in `wrangler.toppings.toml`. It shares only
Firebase verification helpers with the paused Ideas service, not its bindings.
Apply `npx wrangler d1 execute hilltoppers-toppings --config wrangler.toppings.toml
--file=toppings-schema.sql --remote` before `npm run deploy:toppings`. The migration
is idempotent and seeds Ask SJA with zero users and no ratings. Keep
`TOPPING_EMAIL_DOMAINS` set to `student.stjacademy.org,stjacademy.org`.

GET `/api/toppings` lists public cards sorted by unique browser registrations,
with optional caller installation/rating fields. POST publishes immediately for
verified school accounts with a public account name. The name is self-reported,
not a verified legal identity. Email is never public. Ratings remain one per account, regardless of browser.
Users is an estimated browser count, not an exact count of individual people.
Older signed-in clients remain supported; upgrading while signed in replaces
the old account registration with the browser registration. POST/DELETE `/:id/install`
registers/unregisters a browser installation without authentication (identified by
a UUID in `X-Topping-Install-ID`); POST `/:id/rating` replaces its 1–5 star rating
(requires a verified account and an installation). DELETE `/:id` unpublishes the owner's listing.
POST `/:id/report` records or updates a report from a verified account. Bodies are
limited to 12 KB and each author may have at most 20 visible listings. API
credentials are never forwarded to Topping URLs. Toppings receive no account or
schedule data.

Reports are stored in `topping_reports`; they do not send notifications. Review
with `npx wrangler d1 execute hilltoppers-toppings --config wrangler.toppings.toml
--remote --command="SELECT * FROM topping_reports ORDER BY created_at DESC"`.
To take a listing down, set its `toppings.hidden` to 1 using its ID. The extension
checks the catalog when opening and removes hidden listings locally; it cannot
revoke already-loaded offline content. There is no automatic safety review of
independently hosted code.

Run `npm run typecheck` and `npm test` before deployment. Tests use a local D1
simulator and mocked identity verification, never real student accounts.
