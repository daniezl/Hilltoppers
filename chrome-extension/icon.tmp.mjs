import { chromium } from 'playwright';

const dist = '/workspace/chrome-extension/dist';
const wave = Number(process.argv[2] ?? 5);

const ctx = await chromium.launchPersistentContext('/tmp/preview/chrome-profile', {
  executablePath: '/usr/local/bin/google-chrome',
  headless: false,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`]
});

// The service worker registers on load; give it a moment to appear.
let worker = ctx.serviceWorkers()[0];
if (!worker) worker = await ctx.waitForEvent('serviceworker', { timeout: 20000 });
const extensionId = new URL(worker.url()).host;
console.log('extension id:', extensionId);

// Set the lunch wave the way Class settings would, then let the worker react.
const page = await ctx.newPage();
await page.goto(`chrome-extension://${extensionId}/class-settings.html`);
await page.evaluate((w) => new Promise((resolve) => {
  chrome.storage.sync.set({
    schedulePreferences: { lunchPeriod: 1, timeFormat: '12h', graduationYear: 2027, lunchWave: w }
  }, resolve);
}), wave);

for (let i = 0; i < 12; i += 1) {
  const state = await page.evaluate(() => new Promise((resolve) => {
    chrome.action.getTitle({}, (title) => resolve({ title, at: new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York' }) }));
  }));
  console.log(`${state.at}  tooltip: ${state.title}`);
  if (i === 0) continue;
  await new Promise((r) => setTimeout(r, 15000));
}

await ctx.close();
