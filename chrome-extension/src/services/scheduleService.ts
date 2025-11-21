import {
  Timestamp,
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  query,
  where
} from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import { DateTime } from 'luxon';
import { getDb } from '../firebase/app';
import { Block, EST_ZONE, SubBlock } from '../types/schedule';
import { isFirebaseConfigured } from '../firebase/config';
import { resolveBulletinDayType } from './dayTypeResolver';
import {
  getCachedSpecialPeriods,
  setCachedSpecialPeriods,
  getCachedSpecialDay,
  setCachedSpecialDay,
  getCachedSpecialDaysDict,
  setCachedSpecialDaysDict
} from '../storage/firestoreCache';

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
}

type SpecialDayRecord = DocumentData & {
  type?: string;
  details?: string;
  schedule?: RawBlock[];
};

export interface ScheduleResult {
  blocks: Block[];
  dayType: string | null;
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
      subBlocks
    };
  });
}

// Cloudflare Pages URL - 请替换为您的实际 Cloudflare Pages URL
// 例如: "https://schoolapp-schedules.pages.dev"
const CLOUDFLARE_BASE_URL = import.meta.env.VITE_CLOUDFLARE_SCHEDULE_URL || '';

// 调试：检查环境变量是否正确加载
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  console.log('[scheduleService] Cloudflare URL:', CLOUDFLARE_BASE_URL || 'NOT SET');
}

function getCloudflareSpecialDaysUrl(): string {
  if (CLOUDFLARE_BASE_URL) {
    return `${CLOUDFLARE_BASE_URL}/special_days.json`;
  }
  return '';
}

function getCloudflareSpecialPeriodsUrl(): string {
  if (CLOUDFLARE_BASE_URL) {
    return `${CLOUDFLARE_BASE_URL}/special_periods.json`;
  }
  return '';
}

function getAssetUrl(path: string): string {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(path);
  }
  return path;
}

// 缓存 special_days 和 special_periods 数据
let cachedSpecialDaysData: Record<string, SpecialDayRecord> | null = null;
let cachedSpecialPeriodsData: Array<{ start: Date; end: Date }> | null = null;

async function loadSpecialDaysFromCloudflare(): Promise<Record<string, SpecialDayRecord> | null> {
  if (cachedSpecialDaysData) {
    return cachedSpecialDaysData;
  }
  
  const url = getCloudflareSpecialDaysUrl();
  if (!url) {
    console.warn('[scheduleService] Cloudflare URL not configured, VITE_CLOUDFLARE_SCHEDULE_URL is empty');
    return null;
  }
  
  try {
    console.info('[scheduleService] Loading special_days from Cloudflare:', url);
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`[scheduleService] Failed to load special_days from Cloudflare: HTTP ${response.status}`);
      return null;
    }
    const text = await response.text();
    try {
      const data = JSON.parse(text) as Record<string, SpecialDayRecord>;
      cachedSpecialDaysData = data;
      console.info('[scheduleService] Successfully loaded special_days from Cloudflare');
      return data;
    } catch (parseError) {
      console.error('[scheduleService] JSON parse error in special_days:', parseError);
      console.error('[scheduleService] Response text (first 500 chars):', text.substring(0, 500));
      return null;
    }
  } catch (error) {
    console.warn('[scheduleService] Error loading special_days from Cloudflare:', error);
    return null;
  }
}

async function loadSpecialPeriodsFromCloudflare(): Promise<Array<{ start: Date; end: Date }> | null> {
  if (cachedSpecialPeriodsData) {
    return cachedSpecialPeriodsData;
  }
  
  const url = getCloudflareSpecialPeriodsUrl();
  if (!url) {
    console.warn('[scheduleService] Cloudflare URL not configured, VITE_CLOUDFLARE_SCHEDULE_URL is empty');
    return null;
  }
  
  try {
    console.info('[scheduleService] Loading special_periods from Cloudflare:', url);
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`[scheduleService] Failed to load special_periods from Cloudflare: HTTP ${response.status}`);
      return null;
    }
    const text = await response.text();
    try {
      const data = JSON.parse(text) as Array<{ start: string; end: string }>;
      const periods = data.map(p => ({
        start: new Date(p.start),
        end: new Date(p.end)
      }));
      cachedSpecialPeriodsData = periods;
      console.info('[scheduleService] Successfully loaded special_periods from Cloudflare');
      return periods;
    } catch (parseError) {
      console.error('[scheduleService] JSON parse error in special_periods:', parseError);
      console.error('[scheduleService] Response text (first 500 chars):', text.substring(0, 500));
      return null;
    }
  } catch (error) {
    console.warn('[scheduleService] Error loading special_periods from Cloudflare:', error);
    return null;
  }
}

async function fetchSpecialDayData(date: Date): Promise<SpecialDayRecord | null> {
  const formatter = DateTime.fromJSDate(date, { zone: EST_ZONE }).toFormat('yyyy-LL-dd');
  
  // Try cache first
  const cached = await getCachedSpecialDay(formatter);
  if (cached) {
    return cached as SpecialDayRecord;
  }
  
  // 从 Cloudflare 加载
  const cloudflareData = await loadSpecialDaysFromCloudflare();
  if (cloudflareData && cloudflareData[formatter]) {
    const data = cloudflareData[formatter];
    // Cache the result
    await setCachedSpecialDay(formatter, {
      type: data.type,
      details: data.details,
      schedule: data.schedule
    });
    return data;
  }
  
  return null;
}

function decodeScheduleFromData(data: SpecialDayRecord | null): Block[] | null {
  if (!data || !Array.isArray(data.schedule)) {
    return null;
  }
  return mapBlocks(data.schedule);
}

function deriveDayTypeLabel(rawType?: string | null, details?: string | null): string | null {
  const normalize = (value?: string | null): string | null => {
    if (!value) {
      return null;
    }
    const trimmed = value.trim();
    const lower = trimmed.toLowerCase();
    if (lower.includes('green')) {
      return 'Green Day';
    }
    if (lower.includes('white')) {
      return 'White Day';
    }
    if (lower.includes('no_school') || lower.includes('no school')) {
      return 'No School';
    }
    return null;
  };

  return normalize(rawType) ?? normalize(details) ?? (details ? details.trim() : null) ?? null;
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
  // Try cache first
  const cachedPeriods = await getCachedSpecialPeriods();
  if (cachedPeriods) {
    for (const period of cachedPeriods) {
      if (date >= period.start && date <= period.end) {
        return true;
      }
    }
    return false;
  }
  
  // 从 Cloudflare 加载
  const cloudflarePeriods = await loadSpecialPeriodsFromCloudflare();
  if (cloudflarePeriods) {
    for (const period of cloudflarePeriods) {
      if (date >= period.start && date <= period.end) {
        // Cache the periods for future use
        await setCachedSpecialPeriods(cloudflarePeriods);
        return true;
      }
    }
    // Cache the periods even if date is not in any period
    await setCachedSpecialPeriods(cloudflarePeriods);
    return false;
  }
  
  return false;
}

export async function fetchTypeFor(date: Date): Promise<string | null> {
  const data = await fetchSpecialDayData(date);
  return typeof data?.type === 'string' ? data.type : null;
}

export async function loadCustomSchedule(date: Date): Promise<Block[] | null> {
  const data = await fetchSpecialDayData(date);
  return decodeScheduleFromData(data);
}

export async function fetchSpecialDaysDict(start: Date, end: Date): Promise<Record<string, string>> {
  const formatter = (date: Date) => DateTime.fromJSDate(date, { zone: EST_ZONE }).toFormat('yyyy-LL-dd');
  const startId = formatter(start);
  const endId = formatter(end);

  // Try cache first
  const cached = await getCachedSpecialDaysDict(startId, endId);
  if (cached) {
    return cached;
  }

  // 从 Cloudflare 加载
  const cloudflareData = await loadSpecialDaysFromCloudflare();
  if (cloudflareData) {
    const dict: Record<string, string> = {};
    for (const [dateKey, data] of Object.entries(cloudflareData)) {
      if (dateKey >= startId && dateKey <= endId && typeof data.type === 'string') {
        dict[dateKey] = data.type;
      }
    }
    // Cache the result
    await setCachedSpecialDaysDict(dict);
    return dict;
  }
  
  return {};
}

export async function fetchSpecialPeriods(start: Date, end: Date): Promise<Array<{ start: Date; end: Date }>> {
  // Try cache first
  const cachedPeriods = await getCachedSpecialPeriods();
  if (cachedPeriods) {
    // Filter by date range
    return cachedPeriods.filter((period) => {
      return period.end >= start && period.start <= end;
    });
  }
  
  // 从 Cloudflare 加载
  const cloudflarePeriods = await loadSpecialPeriodsFromCloudflare();
  if (cloudflarePeriods) {
    // Cache the periods
    await setCachedSpecialPeriods(cloudflarePeriods);
    // Filter by date range
    return cloudflarePeriods.filter((period) => {
      return period.end >= start && period.start <= end;
    });
  }
  
  return [];
}

function getDefaultScheduleForWeekday(date: Date): string | null {
  const weekday = DateTime.fromJSDate(date, { zone: EST_ZONE }).weekday;
  switch (weekday) {
    case 6: // Saturday
    case 7: // Sunday
      return null; // weekend
    case 1: // Monday
    case 2: // Tuesday
    case 4: // Thursday
      return 'schedule_mon_thu';
    case 3: // Wednesday
      return 'schedule_wed';
    case 5: // Friday
      return 'schedule_fri';
    default:
      return null;
  }
}

export async function loadScheduleByType(type: string): Promise<Block[] | null> {
  return loadJsonSchedule(type);
}

export async function loadBlocksForDate(date: Date): Promise<ScheduleResult> {
  const requestKey = DateTime.fromJSDate(date, { zone: EST_ZONE }).toFormat('yyyy-LL-dd');
  console.info('[scheduleService] loadBlocksForDate start', requestKey);

  if (await isInSpecialPeriod(date)) {
    console.info('[scheduleService] Date falls within special period, returning No School');
    return { blocks: [], dayType: 'No School' };
  }

  const specialDayData = await fetchSpecialDayData(date);
  const rawType = specialDayData?.type ?? null;
  const details = specialDayData?.details ?? null;
  if (specialDayData) {
    console.info('[scheduleService] Special day record found', {
      type: rawType,
      details
    });
  } else {
    console.info('[scheduleService] No special day record for', requestKey);
  }
  let dayTypeLabel = deriveDayTypeLabel(rawType, details);

  if (rawType === 'no_school') {
    console.info('[scheduleService] Raw type no_school, returning empty schedule');
    return { blocks: [], dayType: dayTypeLabel ?? 'No School' };
  }

  if (rawType === 'custom') {
    if (!dayTypeLabel) {
      dayTypeLabel = await resolveBulletinDayType(date);
    }
    const custom = decodeScheduleFromData(specialDayData) ?? [];
    console.info('[scheduleService] Using custom schedule', {
      dayTypeLabel,
      blocks: custom.length
    });
    return { blocks: custom, dayType: dayTypeLabel };
  }

  if (typeof rawType === 'string' && rawType) {
    const typedSchedule = await loadScheduleByType(rawType);
    if (typedSchedule) {
      if (!dayTypeLabel) {
        dayTypeLabel = await resolveBulletinDayType(date);
      }
      console.info('[scheduleService] Loaded typed schedule', {
        rawType,
        dayTypeLabel,
        blocks: typedSchedule.length
      });
      return { blocks: typedSchedule, dayType: dayTypeLabel };
    }
    console.warn('[scheduleService] Failed to load typed schedule asset', rawType);
  }

  if (!dayTypeLabel) {
    dayTypeLabel = await resolveBulletinDayType(date);
  }

  const fallbackKey = getDefaultScheduleForWeekday(date);
  if (!fallbackKey) {
    console.info('[scheduleService] No fallback key (likely weekend)', { dayTypeLabel });
    return { blocks: [], dayType: dayTypeLabel ?? 'Unknown' };
  }

  const fallbackSchedule = await loadJsonSchedule(fallbackKey);
  if (!fallbackSchedule || !fallbackSchedule.length) {
    console.warn('[scheduleService] Fallback schedule missing or empty', fallbackKey);
  } else {
    console.info('[scheduleService] Using fallback schedule', {
      fallbackKey,
      blocks: fallbackSchedule.length,
      dayTypeLabel
    });
  }
  return { blocks: fallbackSchedule ?? [], dayType: dayTypeLabel ?? 'Unknown' };
}
