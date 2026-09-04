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
- [`day_type.json`](./public/day_type.json) — which colour (Green / White / No
  School) each of the next 30 days is, computed from the Daily Bulletin plus
  the two files above. Generated; do not edit by hand. **Not yet read by either
  app** — see below.
- `.well-known/apple-app-site-association` — iOS universal links.

## `scripts/` — keeps `public/` current

All run in GitHub Actions (`.github/workflows/`) with this folder as the
working directory, and write into `public/` by relative path:

- `fetch_menu.mjs` — pushes `menu.json` straight to `main`
- `fetch_day_type.mjs` — pushes `day_type.json` straight to `main`. The rules
  it applies are written at the top of the file and in
  [DATA_FORMAT.md](./DATA_FORMAT.md#day-colour).
- `fetch_sja_calendar.mjs` — opens a pull request for `special_days.json` /
  `special_periods.json`, because those are hand-curated

### `day_type.json` is running in parallel for now

Today both apps parse the school website and predict the colour themselves —
four separate implementations that have already disagreed once. `day_type.json`
is the single replacement. It is being published for a while **without** the
apps reading it, so it can be checked against what they show. When it has been
right for long enough, the apps switch to reading `days[today]` and delete
their own parsers. If you see it disagree with an app, the file's `bulletin`
block says exactly what it read; that plus the app's answer is the bug report.

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
