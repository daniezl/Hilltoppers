/**
 * Green/White for the days ahead, as published to day_type.json by
 * data/scripts/fetch_day_type.mjs. That script reads the Daily Bulletin once
 * a day and walks the alternation forward ~30 days, so the calendar can colour
 * upcoming days without predicting anything itself. Days outside the file's
 * window are simply unknown here; the popup leaves them uncoloured.
 */

export type PublishedDayType = 'Green Day' | 'White Day' | 'No School';

export type DayTypeMap = Record<string, PublishedDayType>;

const CLOUDFLARE_BASE_URL = import.meta.env.VITE_CLOUDFLARE_SCHEDULE_URL || 'https://hilltoppers.pages.dev';
const DAY_TYPE_JSON_URL = `${CLOUDFLARE_BASE_URL}/day_type.json`;
const CACHE_KEY = 'dayTypeCache';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDays(value: unknown): DayTypeMap {
  const days: DayTypeMap = {};
  if (!value || typeof value !== 'object') return days;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!YMD.test(key) || typeof raw !== 'string') continue;
    const lower = raw.toLowerCase();
    if (lower.includes('green')) days[key] = 'Green Day';
    else if (lower.includes('white')) days[key] = 'White Day';
    else if (lower.includes('no school')) days[key] = 'No School';
  }
  return days;
}

export async function fetchDayTypes(): Promise<DayTypeMap> {
  const response = await fetch(DAY_TYPE_JSON_URL, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`day_type.json returned HTTP ${response.status}`);
  }
  const data = (await response.json()) as { days?: unknown };
  return normalizeDays(data.days);
}

export async function loadCachedDayTypes(): Promise<DayTypeMap | null> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return null;
  }
  try {
    const stored = await chrome.storage.local.get(CACHE_KEY);
    const cached = stored?.[CACHE_KEY] as { days?: unknown } | undefined;
    if (!cached?.days) return null;
    return normalizeDays(cached.days);
  } catch {
    return null;
  }
}

export async function saveCachedDayTypes(days: DayTypeMap): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return;
  }
  try {
    await chrome.storage.local.set({ [CACHE_KEY]: { days, cachedAt: Date.now() } });
  } catch {
    // Same as the events cache: not worth failing the render over.
  }
}
