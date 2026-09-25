<img width="120" alt="Hilltoppers icon" src="https://github.com/user-attachments/assets/822f14b5-181b-462f-b9ee-59c1f28534a9" />

# Hilltoppers

Today's schedule, today's day color, and a timer to the end of the block — for
students at Saint Johnsbury Academy. An iOS app and a Chrome extension, built
by a student, open to anyone at SJA who wants to help.

[**Get it on the App Store**](https://apps.apple.com/us/app/hilltoppers/id6749836752) ·
[**Add to Chrome**](https://chromewebstore.google.com/detail/bcjpcmlikbccobbpheojlnmiaffilnaa)

<img width="800" alt="The iOS app: schedule, day color, and widgets" src="https://github.com/user-attachments/assets/65a9984a-1077-4531-9f75-eccbf5774e27" />

<img width="400" alt="The Chrome extension popup" src="https://github.com/user-attachments/assets/876722b8-1dae-4c1c-8d1c-870834710afa" />

## What it does

**Schedule** — the real one for today, including the irregular days (ABDEC,
Spirit Week, late starts, exam weeks). Put in your course names and it shows
them instead of "A Block".

**Day color** — Green or White, without opening the school website.

**Block timer** — how long until this block ends, in the iOS widget and the
Chrome toolbar icon.

**Menu** — what's in the dining hall today (extension).

## Have an idea?

Open an [issue](https://github.com/daniezl/Hilltoppers/issues/new) and
describe it the way you would explain it to a friend — no technical language
needed. Ideas that other students want get the `enhancement` label.

*(An in-extension ideas board where you could vote without a GitHub account is
built but paused; see `worker/`.)*

## Want to help build it?

You do not need to understand all of it. Each folder is one piece, and most
changes touch only one.

| Folder | What it is | Written in | Start here |
|---|---|---|---|
| [`ios/`](./ios) | The iPhone app and its home-screen widget | Swift, SwiftUI | Open `ios/SJA_re.xcodeproj` in Xcode |
| [`chrome-extension/`](./chrome-extension) | The Chrome extension | TypeScript, React | `cd chrome-extension && npm install && npm run dev` |
| [`data/`](./data) | Special days, breaks, the menu — the JSON both apps download | JSON | Edit `data/public/special_days.json`; format in [`DATA_FORMAT.md`](./data/DATA_FORMAT.md) |
| [`worker/`](./worker) | The ideas-board API. The only server code in the project. **Paused** — see its README | TypeScript, Cloudflare Workers | — |
| [`ideas-site/`](./ideas-site) | A website for the ideas board. **Paused** — see its README | TypeScript, React | — |

The most common change is a schedule fix: a special day was missed or has the
wrong times. That is one JSON file, no code, and it is live about a minute after
merging — both apps pick it up the next time they refresh. [`data/README.md`](./data/README.md) explains how.

Anything that needs Firebase or Cloudflare credentials is described in
[`SETUP.md`](./SETUP.md).

### How the pieces fit

```
  data/public/*.json ──► Cloudflare Pages ──► iOS app
  (edited by hand,          (static CDN)   └─► Chrome extension
   or by GitHub Actions)

  school website ──► data/scripts/fetch_day_type.mjs ──► day_type.json
  (Daily Bulletin)   (GitHub Action, every 30 min)       (Green/White per day;
                                                          apps not reading it yet)

  GitHub issues ──► worker/ (votes in D1) ──► Chrome extension "Ideas"   (paused)
```

The schedule never touches a server: it is static JSON that both apps read
directly. The Worker exists only for the ideas board, because votes need to be
counted somewhere — and while that board is paused, no code we run is serving
anything. (Firebase handles sign-in and preference sync; that is Google's
infrastructure, not ours.)

### Working on it

- One branch per change, named for what it does. Merged branches are deleted
  automatically.
- Deploys are manual and separate from merging: the iOS app ships through
  Xcode, the extension through the Chrome Web Store, the Worker with
  `npx wrangler deploy`. Only `data/` deploys itself, on every merge to `main`.
- A [GitHub Action](./.github/workflows) refreshes the dining menu every 30
  minutes and opens a pull request when the school calendar changes.

<details>
<summary>Installing the extension manually from a release</summary>

If you would rather not use the Chrome Web Store:

1. Download `dist.zip` from the [latest release](https://github.com/daniezl/Hilltoppers/releases/latest) and unzip it.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick the unzipped `dist` folder.
4. Click the puzzle icon in the toolbar and pin Hilltoppers.

To update, load the new `dist` folder the same way.

</details>

## License

*(to be chosen — see the note in the pull request)*

## Ask SJA: the first independently hosted topping

`chrome-extension/` embeds a URL and provides a fixed-size collapsible container.
`toppings/ask-sja/` is independently deployable: its own static webpage, Worker
API, corpus, rate limiters and DeepSeek secret. It has no imports or authentication
dependency on the extension or the existing schedule-admin Worker. The public
calendar and day-colour feed URLs can be changed in `wrangler.toml`.

Live site: https://ask-sja-topping.danielzhang089.workers.dev/.
Browsers contact that site only; its server calls DeepSeek. Test this domain on
the school network rather than assuming a DeepSeek website block applies to it.

```sh
cd toppings/ask-sja
npm ci
npm run typecheck
npm test
npm run refresh:corpus
npm run build
npm run deploy
npx wrangler secret put DEEPSEEK_API_KEY
```

The secret belongs to this independent Worker. Enter it at Wrangler's prompt,
never in frontend code or Git. `DEEPSEEK_MODEL` is configurable; the default is
`deepseek-flash`. Without a secret the API returns 503, never a fabricated answer.
`npm run dev` serves http://localhost:8790; local secrets go in ignored `.dev.vars`.
`DEEPSEEK_URL` is a local-test override, not set in the production configuration.

### Conversation and sources

The webpage keeps up to 20 turns locally with a six-hour expiry. Each request sends
only the last three completed turns (six alternating user/assistant messages) plus
the new question. No client-supplied system roles are accepted. User messages are
limited to 500 characters; previous assistant answers to 3,000 characters each;
request bodies to 48 KiB. Old citation numbers are removed from history before it
reaches the model. Both search-query rewriting and answer generation receive the
context. The answer must still be grounded in freshly retrieved passages, not in
previous assistant claims. Backend logs contain retrieval metrics, not questions.

Sources are collapsed under each answer, de-duplicated by document/date, while
inline citation numbers remain linked. Bulletin labels display one publication
date as `Daily Bulletin · Sep 16`; date-only fields are not timezone-converted.
Enter sends, Shift+Enter adds a line and IME composition does not send. New chat
clears context and aborts the in-flight browser request. Completed and failed turns
are saved; interrupted requests require explicit retry after reopening. Embedded
browser storage may differ from standalone storage or be unavailable.

### Data and independent publishing

The corpus fetcher and retrieval code originate in PR #34. Sources and archives
live inside the topping project. The **Update Ask SJA sources** Action runs every 30 minutes and can also be run manually.
It archives bulletins/newsletters and publishes `data/public/ask-sja-corpus.json`
through the existing Cloudflare Pages data site. Ask SJA reads that feed using
`CORPUS_URL`, refreshing its index every 15 minutes (the feed may also be cached
for five minutes). Failed page/PDF fetches keep the previous content. If the
feed is unavailable, Ask SJA keeps its last index or uses its bundled snapshot.
Deploy the Worker once after switching to this feed; later source updates do not
require Worker or extension deployments. `npm run refresh:corpus` updates both
the public feed and bundled fallback. Fixed PDF links remain configured in
`corpus_sources.json`; new editions need their links updated there. Newsletters
not listed by the school can be added to its `newsletters` list. Model requests are limited to 20/minute per network IP and
60/minute on a shared key; Cloudflare's location-local counters are not a hard
global spending cap. School users can share the same network IP.

Publish changes with `npm run deploy` in `toppings/ask-sja`, then reload the topping
from its **⋯** menu. The extension does not need rebuilding for webpage/backend
changes. Host layout changes do require rebuilding the extension.

Validation includes 21 Worker/retrieval tests, six document-parser tests,
TypeScript and extension builds, plus browser checks for multi-turn payloads,
IME/Enter handling, stable panel height, pinned composer, scrolling, source dates,
source expansion, history restore, retry, new chat and the host options menu.
Browser fixtures verify UI behavior separately from live model answers.


## Topping Bar

The extension's **Topping Bar** link opens a catalog of independently hosted
modules. Preview cards show community ratings and unique browser installations
as Users; sorting defaults to most users. Publishing requires a verified SJA
student or staff email and a public author name. The store lives in
`chrome-extension/src/toppings/`; its independent Cloudflare Worker and D1
configuration are in `worker/wrangler.toppings.toml`. See `worker/README.md` for
deployment and report moderation. Creation instructions and starter templates
are intentionally deferred.
