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

Or use the feedback link at the bottom of the extension popup, which needs no
GitHub account.

## Want to help build it?

You do not need to understand all of it. Each folder is one piece, and most
changes touch only one.

| Folder | What it is | Written in | Start here |
|---|---|---|---|
| [`ios/`](./ios) | The iPhone app and its home-screen widget | Swift, SwiftUI | Open `ios/SJA_re.xcodeproj` in Xcode |
| [`chrome-extension/`](./chrome-extension) | The Chrome extension | TypeScript, React | `cd chrome-extension && npm install && npm run dev` |
| [`data/`](./data) | Special days, breaks, the menu — the JSON both apps download | JSON | Edit `data/public/special_days.json`; format in [`DATA_FORMAT.md`](./data/DATA_FORMAT.md) |

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
```

The schedule never touches a server: it is static JSON that both apps read
directly. We run no server code at all. (Firebase handles sign-in and
preference sync, and feedback from the popup lands in Firestore; that is
Google's infrastructure, not ours.)

### Working on it

- One branch per change, named for what it does. Merged branches are deleted
  automatically.
- Deploys are manual and separate from merging: the iOS app ships through
  Xcode, the extension through the Chrome Web Store. Only `data/` deploys
  itself, on every merge to `main`.
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
