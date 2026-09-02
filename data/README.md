# Data

Everything the iOS app and the Chrome extension download at runtime. Both read
these files directly from `https://hilltoppers.pages.dev/`; nothing sits in
between.

## `public/` — served as-is

Every file in here is a public URL at the site root. Nothing goes in here that
is not meant to be served.

- [`special_days.json`](./public/special_days.json) — schedule overrides for
  specific days. Hand-edited; format in [DATA_FORMAT.md](./DATA_FORMAT.md).
- [`special_periods.json`](./public/special_periods.json) — breaks and holidays.
- [`menu.json`](./public/menu.json) — dining hall menu, rewritten every 30
  minutes by a GitHub Action. Do not edit by hand.
- `.well-known/apple-app-site-association` — iOS universal links.

## `scripts/` — keeps `public/` current

Both run in GitHub Actions (`.github/workflows/`) with this folder as the
working directory, and write into `public/` by relative path:

- `fetch_menu.mjs` — pushes `menu.json` straight to `main`
- `fetch_sja_calendar.mjs` — opens a pull request for `special_days.json` /
  `special_periods.json`, because those are hand-curated

## How it is published

A Cloudflare Pages project named `hilltoppers`, connected to this repository:

| Setting | Value |
|---|---|
| Production branch | `main` |
| Root directory | `data` |
| Build command | *(none)* |
| Build output directory | `public` |

The output directory is **relative to the root directory** — the value is
`public`, not `data/public`. The latter makes Pages look for
`data/data/public` and fail with "build output directory not found".

Three places know this folder's layout: those two dashboard settings and the
two workflow files. Rename anything here and all of them move together.
