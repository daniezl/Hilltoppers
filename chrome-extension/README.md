# SchoolApp Chrome Extension

This package contains the Chrome extension implementation for SchoolApp. It mirrors the scheduling logic from the iOS project while focusing on displaying the current schedule and user preferences inside the browser.

## Build after changes

After you edit extension code, run **`npm run build`** in this directory (`chrome-extension/`) so `dist/` is up to date before you reload the extension in Chrome. During development, **`npm run dev`** rebuilds on save so you do not need to run `build` manually each time.

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Build in watch mode while developing:

   ```bash
   npm run dev
   ```

   Vite will output the compiled files to `dist/`. Reload the unpacked extension in Chrome after each rebuild.

3. Create a production build:

   ```bash
   npm run build
   ```

   The command runs Vite and then copies `manifest.json` and the icons into `dist/` so Chrome can load the extension.

4. Load the extension in Chrome:
   - Open `chrome://extensions` and enable **Developer mode**.
   - Click **Load unpacked** and choose the `dist/` directory.

## Configuration

There is nothing to set up. The Firebase project and the schedule data URL are
committed as defaults in `src/firebase/config.ts` and
`src/services/scheduleService.ts`, so `npm ci && npm run build` produces a
working extension.

Firebase web config identifies a project rather than granting access to it, and
it has always shipped inside the built bundle; Firestore Security Rules are what
protect the data. Committing it removes a setup step and, more importantly,
removes a failure mode: a build made without the old `.env.local` was silently
broken — no sign-in, no preference sync, and the day colour stopped being
predicted forward, so the popup showed the previous school day's colour.

### Optional: analytics

The one value not committed is `VITE_FIREBASE_MEASUREMENT_API_SECRET`. That one
is a real secret — it lets the holder write events into our GA4 property. Put it
in `.env.local` (already gitignored) to turn analytics on:

```
VITE_FIREBASE_MEASUREMENT_API_SECRET=...
```

Without it analytics is silently off and nothing else changes.

### Optional: pointing at a different backend

Every committed default is still overridable by its `VITE_*` variable — set
`VITE_FIREBASE_PROJECT_ID`, `VITE_CLOUDFLARE_SCHEDULE_URL` and so on in
`.env.local` to build against a different Firebase project or a different copy
of the schedule data. Names are in `config.ts`.

Before a release, restrict the API key to the published extension identifier in
the Google Cloud Console.

## Project Structure

- `manifest.json`: Chrome extension manifest (MV3).
- `popup.html`, `options.html`: Entry points for popup and options UIs.
- `src/background/`: Background service worker that refreshes schedule data and shares it with the UI.
- `src/popup/`: React UI for the popup, showing the current schedule.
- `src/options/`: Options page for lunch period and hidden blocks preferences.
- `src/services/`: Schedule fetching and day-type prediction logic.
- `public/schedule/`: Bundled JSON schedule fallbacks copied from the iOS project.

## Next Steps

- Account management lives in `login.html`; `returnTo` accepts only Class settings
  or Topping Bar. Login never automatically redirects. Firebase restores sessions
  from IndexedDB, with migration from the previous localStorage persistence.
- Preference edits save locally first. Account-specific pending uploads survive
  page closure and are retried on the next preference sync. A pending upload or
  an edit made during a cloud read prevents older cloud data replacing local edits.
- Port additional settings or analytics from the iOS app as needed.
- Add automated tests using `vitest` to cover scheduling calculations and background refresh logic.

## Ask SJA topping (independent-hosting prototype)

Version 2.0.0 adds an optional conversational Ask SJA topping. Build, load `dist/`
and click **Topping Bar** below Menu to browse and add modules. The topping is collapsed on reopening
and only loads its independent webpage when expanded. The **⋯** menu contains
Open website, Reload and Remove topping. The catalog API host permission lets the extension browse and publish Toppings and save account-based installations and ratings.

The conversation scrolls inside a stable 360px panel; the composer stays at the
bottom. Normal connection is silent. An unavailable service shows an overlay with
retry after 12 seconds, without moving the rest of the popup. Reload and removal
unmount the iframe. The bridge checks the exact origin, window and per-load session
and accepts ready messages only; it shares no account, schedule or storage data.
Forms and user-initiated source tabs are permitted by the iframe sandbox.

The webpage and backend live in `../toppings/ask-sja` and are not bundled in the
extension. The default URL is https://ask-sja-topping.danielzhang089.workers.dev/.
Topping URLs now come from the catalog; they are not compiled into the host.

Enter sends; Shift+Enter inserts a line. IME selection never sends. The input grows
automatically to 94px before scrolling. Sources are collapsed by default, with
one publication date per source. The composer’s ↺ button starts a new chat.
Conversation history is stored by the topping, not the extension; it can be
partitioned between embedded and standalone contexts. It expires after six hours,
and unavailable storage means history will not survive closing. An interrupted
response can be retried after reopening, but is not automatically sent again.

The prototype does not establish Web Store approval or school-network access.
Browser automation exercises the extension popup document in a tab; the toolbar's
focus-driven closing behavior should also be checked manually.


## Topping Bar

Open `toppings.html` through the popup's Topping Bar link. Cards show a preview,
public author name, five-star average with rating count, and Users (distinct
browser installation identifiers with the module added). This is an estimate of
people: separate browser profiles count separately. Sort defaults to most users;
search and newest-first are also available. Empty ratings show “Not rated yet”.
Browsing, adding and removing require no account. Changes are saved locally even
offline and count updates retry when the catalog or popup next opens. Only rating
and publishing require the existing Hilltoppers login. Publishing requires
a verified `student.stjacademy.org` or `stjacademy.org` email and a nonempty account
name. The name is self-reported, not independently verified. Email is never public.
Graduation year is optional. There is no creation tutorial in this release.

The registry is served by a dedicated Worker and D1 database in `worker/`; each Topping remains
independently hosted. See `worker/README.md` for setup and report moderation.
Installed modules are saved on this browser and observed live by the popup. The
old Ask SJA preference migrates without removing the user's existing module.
Legacy Ask SJA installs register with the current browser automatically on upgrade.
The installation identifier stays in chrome.storage.local, survives sign-in/out,
and is sent only to the catalog API, never to iframe authors. Clearing storage or
removing a browser profile cannot reliably tell the server to decrement its count.
