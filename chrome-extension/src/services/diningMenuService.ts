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
  dateLabel: string | null;
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

export async function loadDiningMenuFirstItems(period: DiningPeriod = 'Lunch'): Promise<DiningMenuResult> {
  const data = await safeFetchJson(MENU_JSON_URL);
  const menus = data.menus;
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
    dateLabel: toDateLabel(data.menuDate),
    sourceUrl: typeof data.source === 'string' && data.source.trim().length > 0 ? data.source : MENU_JSON_URL,
    globalFareFirst,
    classicKitchenFirst,
    globalFareMore: globalFareItems.slice(1),
    classicKitchenMore: classicKitchenItems.slice(1),
    fetchedAt,
    rule: 'first-listed'
  };
}
