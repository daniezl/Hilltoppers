import { DateTime } from 'luxon';
import { Block, EST_ZONE, SubBlock } from '../types/schedule';
import { isFirebaseConfigured } from '../firebase/config';
import { resolveBulletinDayType } from './dayTypeResolver';

interface RawSubBlock {
  name: string;
  start: string;
  end: string;
}

interface RawBlock {
  name: string;
  start: string;
  end: string;
  subBlocks?: RawSubBlock[];
  grades?: number[];
}

type SpecialDayRecord = {
  type?: string;
  details?: string;
  color?: string;
  schedule?: RawBlock[];
};

export interface ScheduleResult {
  blocks: Block[];
  dayType: string | null;
  details?: string | null;
  networkFailed?: boolean;
}

function makeId(prefix: string, name: string, index: number): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  const safeName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `${prefix}-${safeName}-${index}`;
}

function mapBlocks(raw: RawBlock[]): Block[] {
  return raw.map((block, index) => {
    const blockId = makeId('block', block.name, index);
    let subBlocks: SubBlock[] | undefined;
    if (block.subBlocks) {
      subBlocks = block.subBlocks.map((sub, subIndex) => ({
        id: makeId('sub', sub.name, subIndex),
        name: sub.name,
        start: sub.start,
        end: sub.end
      }));
    }
    return {
      id: blockId,
      name: block.name,
      start: block.start,
      end: block.end,
      subBlocks,
      grades: block.grades
    };
  });
}

// Static assets from Cloudflare Pages, backed by git (`data/public/`).
// special_days.json is hand-edited there and that file is the source of truth —
// the admin panel / Worker KV path was never used and writes nothing we read.
const CLOUDFLARE_BASE_URL = import.meta.env.VITE_CLOUDFLARE_SCHEDULE_URL || 'https://hilltoppers.pages.dev';

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  console.log('[scheduleService] Cloudflare Pages URL:', CLOUDFLARE_BASE_URL);
}

function getAssetUrl(path: string): string {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(path);
  }
  return path;
}

// Always fetch fresh — no caching.
async function fetchSpecialDays(): Promise<Record<string, SpecialDayRecord> | null> {
  const url = `${CLOUDFLARE_BASE_URL}/special_days.json`;
  try {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) {
      console.warn(`[scheduleService] special_days fetch failed: HTTP ${response.status}`);
      return null;
    }
    return (await response.json()) as Record<string, SpecialDayRecord>;
  } catch (error) {
    console.warn('[scheduleService] special_days fetch error:', error);
    return null;
  }
}

async function fetchSpecialPeriodsList(): Promise<Array<{ start: string; end: string; details?: string }> | null> {
  const url = `${CLOUDFLARE_BASE_URL}/special_periods.json`;
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) {
      console.warn(`[scheduleService] special_periods fetch failed: HTTP ${response.status}`);
      return null;
    }
    const raw = (await response.json()) as Array<{ start: string; end: string; details?: string }>;

    // Normalize "yyyy-M-d" → "yyyy-MM-dd"
    const normalize = (s: string): string | null => {
      if (!s) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
      return null;
    };

    return raw
      .map(p => {
        const start = normalize(p.start);
        const end = normalize(p.end);
        if (!start || !end) {
          console.warn('[scheduleService] Skipping invalid period', p);
          return null;
        }
        return { start, end, details: p.details };
      })
      .filter((p): p is { start: string; end: string; details?: string } => p !== null);
  } catch (error) {
    console.warn('[scheduleService] special_periods fetch error:', error);
    return null;
  }
}

function decodeScheduleFromData(data: SpecialDayRecord | null): Block[] | null {
  if (!data || !Array.isArray(data.schedule)) return null;
  return mapBlocks(data.schedule);
}

function deriveDayTypeLabel(rawType?: string | null, color?: string | null): string | null {
  const normalize = (value?: string | null): string | null => {
    if (!value) return null;
    const lower = value.trim().toLowerCase();
    if (lower.includes('green')) return 'Green Day';
    if (lower.includes('white')) return 'White Day';
    if (lower.includes('no_school') || lower.includes('no school')) return 'No School';
    return null;
  };
  return normalize(color);
}

async function loadJsonSchedule(key: string): Promise<Block[] | null> {
  try {
    const url = getAssetUrl(`schedule/${key}.json`);
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`[scheduleService] Failed to load schedule asset ${key}`);
      return null;
    }
    const data = (await response.json()) as RawBlock[];
    return mapBlocks(data);
  } catch (error) {
    console.error('[scheduleService] Error loading schedule asset', key, error);
    return null;
  }
}

export async function isInSpecialPeriod(date: Date): Promise<boolean> {
  const dateStr = DateTime.fromJSDate(date, { zone: EST_ZONE }).toFormat('yyyy-LL-dd');
  const periods = await fetchSpecialPeriodsList();
  if (!periods) return false;
  return periods.some(p => dateStr >= p.start && dateStr <= p.end);
}

export async function fetchTypeFor(date: Date): Promise<string | null> {
  const days = await fetchSpecialDays();
  const key = DateTime.fromJSDate(date, { zone: EST_ZONE }).toFormat('yyyy-LL-dd');
  const record = days?.[key];
  return typeof record?.type === 'string' ? record.type : null;
}

export async function loadCustomSchedule(date: Date): Promise<Block[] | null> {
  const days = await fetchSpecialDays();
  const key = DateTime.fromJSDate(date, { zone: EST_ZONE }).toFormat('yyyy-LL-dd');
  return decodeScheduleFromData(days?.[key] ?? null);
}

export async function fetchSpecialDaysDict(start: Date, end: Date): Promise<Record<string, string>> {
  const fmt = (d: Date) => DateTime.fromJSDate(d, { zone: EST_ZONE }).toFormat('yyyy-LL-dd');
  const startId = fmt(start);
  const endId = fmt(end);
  const days = await fetchSpecialDays();
  if (!days) return {};
  const dict: Record<string, string> = {};
  for (const [dateKey, data] of Object.entries(days)) {
    if (dateKey >= startId && dateKey <= endId && typeof data.type === 'string') {
      dict[dateKey] = data.type;
    }
  }
  return dict;
}

export async function fetchSpecialPeriods(start: Date, end: Date): Promise<Array<{ start: string; end: string; details?: string }>> {
  const startStr = DateTime.fromJSDate(start, { zone: EST_ZONE }).toFormat('yyyy-LL-dd');
  const endStr = DateTime.fromJSDate(end, { zone: EST_ZONE }).toFormat('yyyy-LL-dd');
  const periods = await fetchSpecialPeriodsList();
  if (!periods) return [];
  return periods.filter(p => p.end >= startStr && p.start <= endStr);
}

function getDefaultScheduleForWeekday(date: Date): string | null {
  const weekday = DateTime.fromJSDate(date, { zone: EST_ZONE }).weekday;
  switch (weekday) {
    case 6:
    case 7:
      return null;
    case 1:
    case 2:
    case 4:
      return 'schedule_mon_thu';
    case 3:
      return 'schedule_wed';
    case 5:
      return 'schedule_fri';
    default:
      return null;
  }
}

export async function loadScheduleByType(type: string): Promise<Block[] | null> {
  return loadJsonSchedule(type);
}

export async function loadBlocksForDate(date: Date): Promise<ScheduleResult> {
  const dateStr = DateTime.fromJSDate(date, { zone: EST_ZONE }).toFormat('yyyy-LL-dd');
  console.info('[scheduleService] loadBlocksForDate', dateStr);

  // Fetch both Cloudflare resources in parallel — no caching.
  const [specialDays, specialPeriods] = await Promise.all([
    fetchSpecialDays(),
    fetchSpecialPeriodsList()
  ]);

  // If BOTH fail, we have no network.
  if (specialDays === null && specialPeriods === null) {
    console.warn('[scheduleService] Network unavailable');
    return { blocks: [], dayType: null, networkFailed: true };
  }

  // Check special period (e.g. Winter Break).
  if (specialPeriods) {
    const period = specialPeriods.find(p => dateStr >= p.start && dateStr <= p.end);
    if (period) {
      console.info('[scheduleService] Date in special period', period.details);
      return { blocks: [], dayType: 'No School', details: period.details ?? null, networkFailed: false };
    }
  }

  // Check special day record.
  const specialDay = specialDays?.[dateStr] ?? null;
  const rawType = specialDay?.type ?? null;
  const details = specialDay?.details ?? null;
  const color = specialDay?.color ?? null;

  if (specialDay) {
    console.info('[scheduleService] Special day', { type: rawType, details, color });
  }

  let dayTypeLabel = deriveDayTypeLabel(rawType, color);

  if (rawType === 'no_school') {
    console.info('[scheduleService] no_school day');
    return { blocks: [], dayType: dayTypeLabel ?? 'No School', details: details ?? null, networkFailed: false };
  }

  if (rawType === 'custom') {
    if (!dayTypeLabel) dayTypeLabel = await resolveBulletinDayType(date);
    const custom = decodeScheduleFromData(specialDay) ?? [];
    return { blocks: custom, dayType: dayTypeLabel, networkFailed: false };
  }

  if (typeof rawType === 'string' && rawType) {
    const typedSchedule = await loadScheduleByType(rawType);
    if (typedSchedule) {
      if (!dayTypeLabel) dayTypeLabel = await resolveBulletinDayType(date);
      return { blocks: typedSchedule, dayType: dayTypeLabel, networkFailed: false };
    }
    console.warn('[scheduleService] Failed to load typed schedule asset', rawType);
  }

  if (!dayTypeLabel) dayTypeLabel = await resolveBulletinDayType(date);

  const fallbackKey = getDefaultScheduleForWeekday(date);
  if (!fallbackKey) {
    // Weekend with no special-day override.
    if (!rawType) {
      return { blocks: [], dayType: 'No School', details: 'Weekend', networkFailed: false };
    }
    return { blocks: [], dayType: dayTypeLabel ?? null, networkFailed: false };
  }

  const fallbackSchedule = await loadJsonSchedule(fallbackKey);
  console.info('[scheduleService] Using fallback schedule', fallbackKey, fallbackSchedule?.length ?? 0, 'blocks');
  return { blocks: fallbackSchedule ?? [], dayType: dayTypeLabel, networkFailed: false };
}
