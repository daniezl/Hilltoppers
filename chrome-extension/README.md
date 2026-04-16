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

## Firebase Configuration

Create a `.env.local` file in `chrome-extension/` (the path is already ignored by git) and populate it with the web config values from `SJA_re/GoogleService-Info.plist`:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
VITE_FIREBASE_MEASUREMENT_API_SECRET=...
```

When these values are absent the extension falls back to static JSON schedules and skips Firestore calls. Providing both `VITE_FIREBASE_MEASUREMENT_ID` and `VITE_FIREBASE_MEASUREMENT_API_SECRET` enables analytics reporting through the GA4 Measurement Protocol; omit them if you want analytics disabled during development. Remember to restrict your API key to the published extension identifier in the Google Cloud Console before release.

## Cloudflare Schedule Configuration

The extension now supports loading special_days and special_periods from Cloudflare Pages. To enable this:

1. Set up Cloudflare Pages (see `CLOUDFLARE_SETUP_GUIDE.md` in the project root)
2. Add the Cloudflare URL to your `.env.local` file:

```
VITE_CLOUDFLARE_SCHEDULE_URL=https://hilltoppers.pages.dev
```

If `VITE_CLOUDFLARE_SCHEDULE_URL` is not set, the extension will return empty data (using default weekday schedules).

## Project Structure

- `manifest.json`: Chrome extension manifest (MV3).
- `popup.html`, `options.html`: Entry points for popup and options UIs.
- `src/background/`: Background service worker that refreshes schedule data and shares it with the UI.
- `src/popup/`: React UI for the popup, showing the current schedule.
- `src/options/`: Options page for lunch period and hidden blocks preferences.
- `src/services/`: Schedule fetching and day-type prediction logic.
- `public/schedule/`: Bundled JSON schedule fallbacks copied from the iOS project.

## Next Steps

- Integrate Firebase authentication if required for secure read access.
- Port additional settings or analytics from the iOS app as needed.
- Add automated tests using `vitest` to cover scheduling calculations and background refresh logic.
