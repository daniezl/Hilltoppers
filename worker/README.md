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

These are public routes and must stay outside Cloudflare Access, which should
only cover `/api/admin/*`.

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

