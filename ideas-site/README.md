# Hilltoppers Ideas

The public ideas board. Students vote on what the extension should do next and
submit their own ideas, without needing a GitHub account.

Each idea is a GitHub issue in `daniezl/Hilltoppers`; this site and the
extension popup are two views of the same data. Votes are stored separately —
see `worker/src/ideas.ts` for why they cannot be GitHub reactions.

## How moderation works

There is no review queue and no admin screen. It rides on the `enhancement`
label:

- The board shows issues labelled `enhancement`.
- Submissions are created **with no labels**, so they are invisible until
  approved.
- To approve, add `enhancement` in the GitHub UI. To reject, delete the issue.

Status comes from GitHub too: `wontfix` → Not right now, closed → Done,
assignee → Being built, otherwise Open for votes.

> If you ever add an issue template, do **not** put `enhancement` in its
> `labels:` field. Templates apply labels regardless of who opens the issue,
> which would let anyone put an unreviewed issue straight onto the board.

## Local development

The site needs the Worker running, or a stand-in for it:

```bash
npm install
node scripts/mock-api.mjs &                       # fake /api/ideas on :8788
VITE_IDEAS_API_URL=http://localhost:8788 npm run dev
```

Voting and submitting need real Firebase config, so with the mock they will
fail at sign-in. Copy `.env.example` to `.env.local` and fill it in to exercise
the full flow against a deployed Worker.

## Deploying

1. Create a Cloudflare Pages project pointing at this directory.
   - Build command: `npm run build`
   - Output directory: `dist`
   - Do **not** put it behind Cloudflare Access; this site is public.
2. Set the `VITE_*` variables from `.env.example` as Pages build environment
   variables. Use the same Firebase project as the extension — that shared
   project is what makes a vote from the popup and a vote from the site count
   as one person.
3. In the Firebase console, add the Pages domain under
   **Authentication → Settings → Authorized domains**. Google sign-in fails
   silently without this.
4. Point the extension at the deployed site by setting `VITE_IDEAS_SITE_URL`
   in `chrome-extension/.env.local`, then rebuild the extension.
