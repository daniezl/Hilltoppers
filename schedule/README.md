# Schedule data

The source of truth for what the iOS app and the Chrome extension show. Both
read these files directly from `https://hilltoppers.pages.dev/`; nothing else
sits in between.

## Files

- [`data/special_days.json`](./data/special_days.json) — schedule overrides for
  specific days. Hand-edited; format in [DATA_FORMAT.md](./DATA_FORMAT.md).
- [`data/special_periods.json`](./data/special_periods.json) — breaks and
  holidays.
- [`data/menu.json`](./data/menu.json) — dining hall menu, rewritten every 30
  minutes by a GitHub Action. Do not edit by hand.
- `data/.well-known/apple-app-site-association` — iOS universal links. Must
  stay published at the site root.

## Scripts

Both run in GitHub Actions (`.github/workflows/`) with this folder as the
working directory, and write into `data/` by relative path:

- `scripts/fetch_menu.mjs` — pushes `menu.json` straight to `redesign`
- `scripts/fetch_sja_calendar.mjs` — opens a pull request for
  `special_days.json` / `special_periods.json`, because those are hand-curated

## How it is published

A Cloudflare Pages project named `hilltoppers`, connected to this repository:

| Setting | Value |
|---|---|
| Production branch | `redesign` |
| Root directory | `schedule` |
| Build command | *(none)* |
| Build output directory | `data` |

Everything in `data/` becomes a public URL, so nothing goes in there that is
not meant to be served. The three paths above — root directory here, and the
two workflow files — are the only places that know this folder's name. Rename
it again and all three move together.
