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
- [`corpus.json`](./public/corpus.json) — every school document the
  extension's Ask box can quote from (Daily Bulletin archive, SJA News
  issues, student handbook, dress code…), cut into short passages with their
  source and date. Read by the Worker's `/api/ask`. Generated; do not edit by
  hand. Which pages and PDFs go in is listed in
  [`corpus_sources.json`](./corpus_sources.json).
- `.well-known/apple-app-site-association` — iOS universal links.

## `corpus/` — archives the school site does not keep

The Daily Bulletin page only ever shows today's bulletin, and the newsletter
archive page lags the inbox by weeks. `corpus/bulletins.json` (one entry per
date) and `corpus/newsletters.json` (one per issue URL) are where
`fetch_corpus.mjs` keeps what it has already read, so the history survives
between Action runs. Committed, generated, not served.

To add an SJA News issue the archive page has not listed yet, open the email,
copy its "View as Webpage" link (`myemail.constantcontact.com/…`) into the
`newsletters` list in `corpus_sources.json`, and the next run picks it up.

## `scripts/` — keeps `public/` current

All run in GitHub Actions (`.github/workflows/`) with this folder as the
working directory, and write into `public/` by relative path:

- `fetch_menu.mjs` — pushes `menu.json` straight to `main`
- `fetch_day_type.mjs` — pushes `day_type.json` straight to `main`. The rules
  it applies are written at the top of the file and in
  [DATA_FORMAT.md](./DATA_FORMAT.md#day-colour).
- `fetch_sja_calendar.mjs` — opens a pull request for `special_days.json` /
  `special_periods.json`, because those are hand-curated
- `fetch_corpus.mjs` — pushes `corpus.json` and the `corpus/` archives
  straight to `main`. `npm test` runs the parser tests in `scripts/lib/`.

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
