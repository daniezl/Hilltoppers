# SchoolApp Chrome Extension

This package contains the Chrome extension implementation for SchoolApp. It mirrors the scheduling logic from the iOS project while focusing on displaying the current schedule and user preferences inside the browser.

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

Update `src/firebase/config.ts` with the values from `SJA_re/GoogleService-Info.plist`. Until the placeholders are replaced, the extension falls back to static schedule JSON files and skips Firestore calls.

Restrict the API key to the published extension identifier in the Google Cloud Console once you release the extension.

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
