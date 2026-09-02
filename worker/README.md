# Hilltoppers Worker

Two unrelated things live here:

- **Ideas board** (`/api/ideas/*`) — live, backs the extension popup and
  `ideas-site/`. See below.
- **Schedule admin** (`/api/admin/*`) — the older half, and effectively dead.
  Nothing reads the KV data it writes; the source of truth for special days is
  the git-tracked `hilltoppers-pages/data/special_days.json` served from
  Cloudflare Pages, which is what the iOS app and the extension actually fetch.

---

# Ideas board

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

Afterwards the website still has to be set up in the Cloudflare dashboard; the
script prints those steps when it finishes, and `ideas-site/README.md` has them
too.

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
- `POST /api/ideas/handoff` — signed in; returns a single-use code that carries
  the session to the site
- `POST /api/ideas/handoff/redeem` — trades that code back for the ID token
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

These are public routes and must stay outside Cloudflare Access, which should
only cover `/api/admin/*`.

## Signing in on the site

Firebase scopes a session to one origin, so the popup
(`chrome-extension://…`) and the site (`…pages.dev`) never share a login. The
popup therefore asks the Worker for a one-minute single-use code, opens the
site with it in the URL fragment, and the site trades it back for the ID token
behind it. The code, not the token, is what is exposed, and it is spent on
first use.

A handed-over session cannot refresh itself — the site holds a token, not an
account — so it lapses after about an hour and the site falls back to ordinary
sign-in. That fallback is email and password, the one method the extension
offers, so the two surfaces resolve to one Firebase account, which is what
keeps votes to one per person across them.

Google and Apple are deliberately absent. The extension has the code for both
but keeps the buttons commented out, and Apple is not usable anyway: the
project answers `OPERATION_NOT_ALLOWED : Code flow is not enabled for Apple`.
Adding a provider here before the extension has it would split accounts, since
signing in with Google would create a second uid with none of the votes.

---

# Schedule admin (legacy)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a KV namespace:
```bash
npx wrangler kv namespace create SCHEDULE_KV
```

3. Update `wrangler.toml` with your KV namespace ID

4. Set environment variables in Cloudflare Dashboard or via CLI:
```bash
wrangler secret put EDITORS
wrangler secret put ADMINS
```

Or set them as plain environment variables (not secrets) in the Cloudflare dashboard.

## Development

```bash
npm run dev
```

## Deployment

```bash
npm run deploy
```

## Environment Variables

- `EDITORS`: Comma-separated list of editor email addresses (e.g., `editor1@example.com,editor2@example.com`)
- `ADMINS`: Comma-separated list of admin email addresses (e.g., `admin@example.com`)
- `CLOUDFLARE_ACCESS_AUD`: (Optional) Cloudflare Access audience tag for JWT verification
- `SCHEDULE_KV`: KV namespace binding (configured in wrangler.toml)

## Authentication

The worker trusts Cloudflare Access for authentication. It extracts the user email from:

1. `Cf-Access-Authenticated-User-Email` header (primary method)
2. `Cf-Access-Jwt-Assertion` header (fallback, parses JWT payload)

## Authorization

Roles are determined by email allowlists:

- If email is in `ADMINS` → `admin` role
- If email is in `EDITORS` → `editor` role
- Otherwise → unauthorized (403)

## API Endpoints

### Public Endpoints

- `GET /api/special_days.json` - Get published schedules (no auth required)

### Protected Endpoints (require authentication)

- `GET /api/admin/user` - Get current user info
- `GET /api/admin/drafts` - List all drafts (editor+)
- `POST /api/admin/drafts` - Save a draft (editor+)
- `DELETE /api/admin/drafts/:dateKey` - Delete a draft (editor+)
- `POST /api/admin/publish` - Publish a draft (admin only)
- `POST /api/admin/rollback` - Rollback a published schedule (admin only)

## KV Storage Structure

- `draft:YYYY-MM-DD` - Draft schedule data
- `published:YYYY-MM-DD` - Published schedule data
- `special_days` - Aggregate JSON object of all published schedules

## Cloudflare Access Setup

1. In Cloudflare Zero Trust, create an Access application
2. Protect routes: `/admin/*` and `/api/admin/*`
3. Configure identity providers (Google, Microsoft, Email OTP)
4. Set access policies to allow authorized users
5. The worker will automatically receive authentication headers

