# Schedule Admin UI

Internal admin interface for managing school schedules. Designed with strict utilitarian principles - no gradients, blur, shadows, or decorative effects.

## Design Philosophy

- **Clarity over decoration**: Every visual element serves a purpose
- **Flat design**: No shadows, gradients, or blur effects
- **System fonts only**: Uses system-ui font stack
- **Chrome extension palette**: Matches the existing extension color scheme
- **Utilitarian**: Similar to Google Calendar, GitHub settings, Chrome internal tools

## Development

```bash
npm install
npm run dev
```

The app will be available at `http://localhost:3000`.

## Build

```bash
npm run build
```

Output will be in the `dist/` directory, ready for deployment to Cloudflare Pages.

## Deployment

### Cloudflare Pages

1. Connect your repository to Cloudflare Pages
2. Set build command: `npm run build`
3. Set output directory: `dist`
4. Set root directory: `admin`

### Cloudflare Access Configuration

The admin UI must be protected by Cloudflare Access:

1. In Cloudflare Dashboard, go to Zero Trust → Access → Applications
2. Create a new application for `admin.<your-domain>`
3. Configure identity providers (Google, Microsoft, Email OTP)
4. Set up access policies to allow only authorized users
5. The Worker backend will automatically receive authentication headers

### Environment Variables

Set these in Cloudflare Worker environment variables:

- `EDITORS`: Comma-separated list of editor email addresses
- `ADMINS`: Comma-separated list of admin email addresses
- `SCHEDULE_KV`: KV namespace binding (configured in wrangler.toml)

## Authentication

The UI does not implement login. All authentication is handled by Cloudflare Access:

1. User visits `https://admin.<domain>`
2. Cloudflare Access redirects to login page
3. User authenticates via Google/Microsoft/Email OTP
4. Cloudflare Access injects headers into requests
5. Worker backend verifies authentication and authorizes based on email allowlists

## API Endpoints

All API calls are made to `/api/admin/*`:

- `GET /api/admin/user` - Get current user info
- `GET /api/admin/drafts` - List all schedule drafts
- `POST /api/admin/drafts` - Save a schedule draft
- `DELETE /api/admin/drafts/:dateKey` - Delete a draft
- `POST /api/admin/publish` - Publish a draft (admin only)
- `POST /api/admin/rollback` - Rollback a published schedule (admin only)

## Roles

- **Editor**: Can create and edit schedule drafts
- **Admin**: Can publish and rollback schedules (includes all editor permissions)

