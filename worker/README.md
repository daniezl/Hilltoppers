# Schedule Admin Worker

Cloudflare Worker backend for the Schedule Admin system. Handles authentication via Cloudflare Access and provides API endpoints for schedule management.

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

