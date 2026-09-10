export type DiningPeriod = 'Breakfast' | 'Lunch' | 'Dinner';

export type DiningFetchErrorCode =
  | 'network'
  | 'parse'
  | 'no_station'
  | 'no_item';

export class DiningMenuError extends Error {
  code: DiningFetchErrorCode;

  constructor(code: DiningFetchErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'DiningMenuError';
  }
}

export interface DiningMenuResult {
  period: DiningPeriod;
  /** The day this menu is for, YYYY-MM-DD. */
  dateKey: string;
  dateLabel: string | null;
  /** Every day the file holds a menu for, ascending — the picker's range. */
  availableDates: string[];
  sourceUrl: string;
  globalFareFirst: string | null;
  classicKitchenFirst: string | null;
  globalFareMore: string[];
  classicKitchenMore: string[];
  fetchedAt: string;
  rule: 'first-listed';
}

const CLOUDFLARE_BASE_URL = import.meta.env.VITE_CLOUDFLARE_SCHEDULE_URL || 'https://hilltoppers.pages.dev';
const MENU_JSON_URL = `${CLOUDFLARE_BASE_URL}/menu.json`;

type RawMenuEntry = {
  globalFare?: unknown;
  classicKitchen?: unknown;
};

type RawMenuJson = {
  updatedAt?: unknown;
  source?: unknown;
  menuDate?: unknown;
  menus?: Record<string, RawMenuEntry>;
  /** Keyed by YYYY-MM-DD. Absent in files written before the day picker. */
  days?: Record<string, Record<string, RawMenuEntry>>;
};

function normalizeItems(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      continue;
    }
    const trimmed = item.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(trimmed);
    }
  }
  return result;
}

function toDateLabel(menuDate: unknown): string | null {
  if (typeof menuDate !== 'string') {
    return null;
  }
  const match = menuDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  // Use noon UTC to avoid timezone edge cases while formatting in EST/EDT.
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/New_York'
  }).format(date);
}

async function safeFetchJson(url: string): Promise<RawMenuJson> {
  let response: Response;
  try {
    response = await fetch(url, { cache: 'no-cache' });
  } catch (error) {
    throw new DiningMenuError('network', `Failed to fetch ${url}: ${(error as Error).message}`);
  }

  if (!response.ok) {
    throw new DiningMenuError('network', `Failed to fetch ${url}: HTTP ${response.status}`);
  }

  try {
    return (await response.json()) as RawMenuJson;
  } catch (error) {
    throw new DiningMenuError('parse', `Failed to parse ${url} as JSON: ${(error as Error).message}`);
  }
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** The days the file carries a menu for, ascending. */
function listDates(data: RawMenuJson): string[] {
  const days = data.days;
  if (days && typeof days === 'object') {
    const keys = Object.keys(days).filter((key) => YMD.test(key));
    if (keys.length > 0) return keys.sort();
  }
  return typeof data.menuDate === 'string' && YMD.test(data.menuDate) ? [data.menuDate] : [];
}

export async function loadDiningMenuFirstItems(
  period: DiningPeriod = 'Lunch',
  dateKey?: string
): Promise<DiningMenuResult> {
  const data = await safeFetchJson(MENU_JSON_URL);
  const availableDates = listDates(data);
  // Asking for a day the file has dropped falls back to the first one it has,
  // which is today — better than an error when a popup was left open overnight.
  const resolvedDate =
    dateKey && availableDates.includes(dateKey)
      ? dateKey
      : availableDates[0] ?? (typeof data.menuDate === 'string' ? data.menuDate : '');

  const menus = data.days?.[resolvedDate] ?? data.menus;
  if (!menus || typeof menus !== 'object') {
    throw new DiningMenuError('parse', 'menu.json is missing the menus object');
  }
  const entry = menus[period.toLowerCase()] ?? menus[period];
  if (!entry || typeof entry !== 'object') {
    throw new DiningMenuError('no_item', `No menu data found for ${period}`);
  }

  const globalFareItems = normalizeItems((entry as RawMenuEntry).globalFare);
  const classicKitchenItems = normalizeItems((entry as RawMenuEntry).classicKitchen);
  const globalFareFirst = globalFareItems[0] ?? null;
  const classicKitchenFirst = classicKitchenItems[0] ?? null;

  if (!globalFareFirst && !classicKitchenFirst) {
    throw new DiningMenuError('no_station', `No usable menu items found for ${period}`);
  }

  const fetchedAt =
    typeof data.updatedAt === 'string' && data.updatedAt.trim().length > 0
      ? data.updatedAt
      : new Date().toISOString();

  return {
    period,
    dateKey: resolvedDate,
    dateLabel: toDateLabel(resolvedDate),
    availableDates,
    sourceUrl: typeof data.source === 'string' && data.source.trim().length > 0 ? data.source : MENU_JSON_URL,
    globalFareFirst,
    classicKitchenFirst,
    globalFareMore: globalFareItems.slice(1),
    classicKitchenMore: classicKitchenItems.slice(1),
    fetchedAt,
    rule: 'first-listed'
  };
}
