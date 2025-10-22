# Chrome Extension Implementation Guide

This document describes the steps required to port the existing SchoolApp iOS application into a Chrome extension. Follow every step in order. If a step raises questions, document the assumption you make and continue.

## 1. Understand the Existing App
- Review `SJA_re/ContentView.swift` to see how the UI presents the schedule, countdown, and settings.
- Review the schedule layer: `SJA_re/ScheduleService.swift`, `SJA_re/Schedule/ScheduleTypeFetcher.swift`, `SJA_re/Schedule/ScheduleLoader.swift`, and the JSON files under `SJA_re/Schedule/scheduleConfig`.
- Review settings-related classes inside `SJA_re/ContentView.swift` (search for `BlockSettingsManager` and any supporting models).
- Identify which user settings need to be mirrored: lunch period, block visibility toggles, and any general toggles stored in singletons.

## 2. Define the Extension Feature Set
- Decide the minimum viable feature set for v1. Required: display current block, upcoming blocks with times, day type, and countdown until block change; allow editing of lunch period and block visibility preferences.
- Optional stretch goals: action badge showing countdown, side panel schedule view, quick access context menu, Firebase analytics.
- Document in `docs/extension-scope.md` what will be delivered in v1 versus later.

## 3. Set Up the Project Skeleton
- Create a new folder `chrome-extension/` in the repository root.
- Initialize the project with `npm init -y`.
- Install tooling (recommend Vite + React + TypeScript): `npm install -D vite @vitejs/plugin-react typescript ts-node @types/node`, then `npm install react react-dom`.
- Configure a `tsconfig.json` suitable for a browser target.
- Create `manifest.json` (Manifest V3) with:
  - `name`, `description`, `version` (keep in sync with package.json).
  - `manifest_version`: 3.
  - `action` with `default_popup`: `popup.html`.
  - `background.service_worker`: `background.ts`.
  - `options_page`: `options.html`.
  - `permissions`: `storage`, `alarms`, `identity` (if Firebase needs OAuth), and `scripting` if you later inject scripts.
  - `icons` referencing 16/48/128 px assets (reuse iOS app icons or create derivatives).
- Configure Vite to emit separate bundles for `popup`, `options`, and `background`. Provide build scripts:
  - `npm run dev` for development with watch.
  - `npm run build` to produce production bundles under `dist/` ready for Chrome.

## 4. Port Shared Data Models
- Convert the `Block` and `SubBlock` Swift structs to TypeScript interfaces. Include IDs, names, start/end strings, and optional `subBlocks`.
- Ensure utility functions handle EST conversions. Use either `luxon` (`npm install luxon`) or `Intl.DateTimeFormat` with `America/New_York` timezone.
- Introduce a `types/schedule.ts` file exporting these interfaces and time helpers.

## 5. Port the Schedule Service
- Copy the JSON schedule files (`late_start.json`, `schedule_mon_thu.json`, etc.) into `chrome-extension/public/schedule/`.
- Implement `ScheduleLoader` (TypeScript) that loads the JSON assets using `fetch` relative to the extension root.
- Recreate logic from `ScheduleService.loadBlocks`:
  1. Check `isInSpecialPeriod`.
  2. If not, call `fetchTypeFor`.
  3. Handle `no_school` (return empty) and `custom` (load schedule from Firestore JSON `schedule` array).
  4. Fall back to default schedule JSON based on weekday.
- Use the Firebase Web SDK (`firebase/app`, `firebase/firestore`) with the same config as `SJA_re/GoogleService-Info.plist`. Store API keys in environment variables if possible; otherwise lock down Firestore rules to read-only and domain restrict the API key.
- Create a `services/scheduleService.ts` module exposing async functions for other parts of the extension.

## 6. Migrate Predictive and Batch Fetch Logic
- Port `ScheduleTypeFetcher.predictDayType` into TypeScript (consider `services/dayTypePredictor.ts`).
- Reimplement helper functions to batch fetch special days and periods using Firestore queries.
- Ensure Firestore date range queries mirror the Swift logic (inclusive bounds, `FieldPath.documentID` comparisons, timestamp comparisons).

## 7. Mirror User Settings
- Recreate `BlockSettingsManager` and any other relevant managers as TypeScript classes or Zustand/Redux stores.
- Persist settings via `chrome.storage.sync` so they sync across browsers.
- Create a utility to migrate default settings on first run.
- Provide selectors/functions for lunch period, block visibility toggles, and any additional preferences you keep in the extension.

## 8. Background Data Refresh
- Implement the background service worker (`background.ts`) that:
  - On startup, loads user settings and the current schedule for today.
  - Creates or updates a `chrome.alarms` entry (e.g., every 5 minutes) to refresh schedule data and broadcast the latest information via `chrome.runtime.sendMessage`.
  - Handles 5th lunch special-case logic (e.g., block visibility) exactly as in Swift when preparing data for the popup.
- Ensure time comparisons always occur in EST to match the iOS app.

## 9. Popup UI
- Build `popup/Popup.tsx` to display:
  - Current day type, current block, minutes remaining, next block.
  - A list of today`s blocks with start/end times, honoring block visibility prefs.
  - A refresh button to re-fetch schedule data (for debugging).
- Create a shared data store (React context or Zustand) to share schedule state between the popup and options page.
- Ensure the popup listens for messages from the background worker (`chrome.runtime.onMessage`) to receive schedule updates.

## 10. Options Page UI
- Build `options/Options.tsx` allowing the user to:
  - Choose lunch period.
  - Toggle visibility per block (checkbox list similar to iOS settings screen).
  - Adjust any additional extension preferences you decide to support.
- Persist changes immediately to `chrome.storage.sync` and notify the background worker about updates via `chrome.runtime.sendMessage`.

## 11. Testing and QA
- Add unit tests using `vitest` to cover:
  - Schedule loading fallback logic.
  - Day type prediction toggling.
  - Data preparation logic used by the popup (e.g., lunch period adjustments).
- Write integration tests with `puppeteer` or `chrome-extension-cli` if time permits, focusing on background alarms and data refresh messaging.
- Provide manual test checklist covering time zone handling, weekends/no school days, and custom schedule scenarios.

## 12. Build and Packaging
- Update `package.json` scripts:
  - `npm run dev`: start Vite in watch mode, outputting to `dist` (use `rollupOptions` to place assets in `dist`).
  - `npm run build`: clean `dist` and create production bundles.
  - `npm run zip`: zip the `dist/` folder into `build/SchoolAppExtension.zip` for Chrome Web Store submission.
- Document Chrome DevTools loading instructions in `docs/extension-dev-setup.md` (enable developer mode, load unpacked pointing to `dist/`).
- Add a GitHub Actions workflow (optional) to run tests and produce the build artifact on push to main.

## 13. Security and Configuration
- Place Firebase configuration in `src/firebase/config.ts`; restrict API key in Google Cloud Console to chrome-extension://<extension-id> once published.
- Confirm Firestore rules restrict writes and only allow reads required by the extension.
- Do not check in secrets other than the public Firebase config.

## 14. Documentation
- Update the repository README with a section describing the Chrome extension, how to build/install it locally, and how it stays in sync with the iOS app.
- Record any differences in behavior between the iOS app and the extension (e.g., missing analytics, alternate UI patterns).
- Provide onboarding instructions for new developers inside `chrome-extension/README.md`.

## 15. Deliverables Checklist
- [ ] `chrome-extension/manifest.json` with correct metadata and permissions.
- [ ] TypeScript schedule services and models matching Swift logic.
- [ ] Background service worker that refreshes schedule data and broadcasts updates.
- [ ] Popup UI showing current and upcoming blocks.
- [ ] Options page covering schedule preferences.
- [ ] Unit tests covering core logic with passing results.
- [ ] Build scripts producing a zipped artifact ready for Chrome Web Store upload.
- [ ] Documentation updates covering setup, development, testing, and deployment.
