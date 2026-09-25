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
--file=toppings-schema.sql --remote` before `npm run deploy:toppings`. The base schema creates tables without seeding a built-in listing. For an existing
database without the `icon` column, first apply `topping-icon-migration.sql`
with the same command (once only), then apply the base schema. Keep
`TOPPING_EMAIL_DOMAINS` set to `student.stjacademy.org,stjacademy.org`.

Published Toppings require an explicit `icon` ID: `sparkle`, `chat`, `book`,
`calendar`, `clock`, `checklist`, `music`, `trophy`, `lightbulb`, `heart`, `bell`,
or `people`. The extension uses it in the collapsed Topping header.

GET `/api/toppings` lists public cards sorted by unique browser registrations,
with optional caller installation/rating fields. POST creates a pending submission for verified school accounts or linked school
emails. The server derives the author name from the verified school email,
ignoring editable profile names. Email is never public. Ratings remain one per account, regardless of browser.
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

## Account email

`wrangler.email.toml` runs the separate `hilltoppers-account-email` Worker.
Firebase remains the account store. Resend sends both a Firebase action link
and a six-digit code for password reset or email verification. School email linking uses a separate code-only flow and preserves the original
Firebase sign-in email. This does not implement passwordless sign-in.

Server secrets are `RESEND_API_KEY` (sending-only), `OTP_SECRET` (at least 32
random bytes), and `FIREBASE_SERVICE_ACCOUNT` (JSON for this Firebase project).
The service account needs `firebaseauth.users.sendEmail` to generate Firebase action links and
`firebaseauth.users.get` to check whether a reset address is registered. Never put these values in the extension or commit them.
Set each through `wrangler secret put NAME --config wrangler.email.toml`.
`EMAIL_FROM` must use a domain verified in Resend. The current sender is
`Hilltoppers <hilltoppers@daniezl.com>`.

Initialize with `wrangler d1 execute hilltoppers-account-email --config
wrangler.email.toml --file=email-schema.sql --remote`. Run `npm run typecheck`
and `npm test`, then `npm run deploy:email` once the secrets are configured.
Do not ship the extension client before the live service has been verified.

POST `/api/account-email/send` accepts `purpose: reset` with `email`, or
`purpose: verify` with a Firebase bearer token. Verification always uses the
signed-in account's address. Both return an opaque `challengeId`. POST
`/api/account-email/redeem` takes that ID and a six-digit `code` (and the same
account's token for verification). It returns the Firebase `actionCode`, which
the client applies through Firebase's password reset/email verification SDK.
Unknown reset addresses return 404 with "No account found with this email."
after an authenticated Firebase account lookup. Lookup or delivery failures
remain service errors, never an unregistered-account message.

Codes expire after 10 minutes, permit five attempts and can be redeemed once.
Action codes are encrypted in D1 and OTPs are keyed hashes. Rate limits apply
per recipient, IP and globally. Expired rows are removed hourly. Resend errors
are reported as failures rather than successful sends. Tests mock Firebase and
Resend and use a local D1 simulator; they do not send real email. Links retain
Firebase's own expiration and one-time-use rules. A Resend delivery event means
the destination server accepted the mail, not that it escaped spam/quarantine.

POST `/api/account-email/check` accepts an email and returns `exists` for failed
password sign-ins. It shares the IP rate limit and has a separate global lookup
limit. It never sends mail or creates a reset challenge. If lookup fails, the
client preserves Firebase's original login error instead of claiming absence.

### School email binding

POST `/api/account-email/school` returns the authenticated account's school
email and verification status. School-domain sign-in accounts use Firebase's
verification state directly. Other accounts can POST `/school/send` with a
school email, then `/school/redeem` with the challenge ID and code. All three
routes require the caller's Firebase token. Codes are bound to that UID, expire
in ten minutes, allow five attempts and are consumed atomically with binding.
Only `student.stjacademy.org` and `stjacademy.org` are accepted. Each UID and
school email can have one binding. No Firebase login address or password is
changed. Pending addresses are encrypted; confirmed bindings live in the
private `school_links` table. POST `/school/unlink` removes only the authenticated caller’s binding and pending
codes. The UI asks for confirmation. It cannot unlink a primary school login
email. Unlinking revokes linked-school publishing eligibility without deleting
existing Toppings or changing login credentials.

The Topping Bar Worker reads the same database through `SCHOOL_EMAIL_DB` to
recognize verified bindings for publishing. For linked accounts, the public
author name is derived from the school email's local part; it is not a
Microsoft directory lookup. Apply `email-schema.sql` before deploying the
email and Topping Bar Workers with these routes/bindings.

### Topping submissions and previews

Before deploying the review workflow to an existing database, apply
`topping-review-migration.sql` once with `wrangler d1 execute` and
`--config wrangler.toppings.toml --remote`. Existing listings remain approved;
new submissions default to pending. Fresh databases use `toppings-schema.sql`.
`TOPPING_REVIEWER_EMAIL` identifies the reviewer and requires a verified Firebase
email claim. GET `/api/toppings/submissions` returns the caller's submissions,
plus pending submissions for the reviewer. POST `/:id/review` accepts
`status: "approved"` or `"rejected"` only from that reviewer. Public catalog,
installation and rating endpoints exclude pending and rejected submissions.

The publishing form resizes PNG/JPEG/WebP uploads and sends `imageData` as a
base64 data URL. The server caps the request at 720 KB, validates the image type
and signature, and stores the image with its submission atomically in D1.
`/:id/image` serves the image with a fixed image content type and `nosniff`.
Preview image URLs are public, including during review; they contain random
submission IDs. Legacy preview URLs are still accepted, but legacy clients also
submit to the review queue and cannot override the author or approval status.

The extension defaults to the owner-published Ask SJA listing
`2e318d5f-57cf-4799-8443-f5c41cf0a1e3`. Each browser migrates once, replacing
the legacy `ask-sja` installation without duplicates. Later user removals are
respected. Installation counts register normally when the catalog is reachable.

Short descriptions are optional (up to 180 characters); name, icon, webpage URL
and preview image are required when submitting a Topping.

### Public suggestions

The Topping Bar Worker also serves `/api/suggestions`. Apply
`suggestions-schema.sql` to `hilltoppers-toppings` with
`wrangler d1 execute hilltoppers-toppings --config wrangler.toppings.toml --remote --file suggestions-schema.sql`
before deploying this endpoint. Private feedback still goes to the existing
Firestore collection and is never copied into this public list.

Public posts require a verified school email or a verified linked school email.
The server derives the displayed name from that email; public responses omit
email addresses, account IDs, and contact details. `GET /api/suggestions/identity`
returns the caller's eligible public name. `POST /api/suggestions` accepts a
message and a client-generated `requestId` for safe retries, with a limit of
10 public posts per account per day. GET lists newest posts with cursor pagination.
Signed-in accounts can POST `/:id/vote` with `value` 1, -1, or 0 (cancel).
A database primary key enforces one vote per account per suggestion.

Authors can DELETE `/api/suggestions/:id`; the verified account configured in
`TOPPING_REVIEWER_EMAIL` can also delete any public suggestion. Votes and the
suggestion are deleted together. GET includes a caller-specific `canDelete`
flag without exposing the author account ID.
