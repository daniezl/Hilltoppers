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
import { firebaseConfig } from '../firebase/config';
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

function getAssetUrl(path: string): string {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(path);
  }
  return path;
}

function isFirebaseReady(): boolean {
  return Object.values(firebaseConfig).every((value) => typeof value === 'string' && !value.startsWith('REPLACE_ME'));
}

async function fetchSpecialDayData(date: Date): Promise<SpecialDayRecord | null> {
  if (!isFirebaseReady()) {
    return null;
  }
  const db = getDb();
  const formatter = DateTime.fromJSDate(date, { zone: EST_ZONE }).toFormat('yyyy-LL-dd');
  const ref = doc(db, 'special_days', formatter);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    return null;
  }
  return snapshot.data() as SpecialDayRecord;
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
  if (!isFirebaseReady()) {
    return false;
  }
  const db = getDb();
  const snapshot = await getDocs(collection(db, 'special_periods'));
  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const start = data.start as Timestamp | undefined;
    const end = data.end as Timestamp | undefined;
    if (!start || !end) continue;

    const startDate = start.toDate();
    const endDate = end.toDate();
    if (date >= startDate && date <= endDate) {
      return true;
    }
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
  if (!isFirebaseReady()) {
    return {};
  }
  const db = getDb();
  const formatter = (date: Date) => DateTime.fromJSDate(date, { zone: EST_ZONE }).toFormat('yyyy-LL-dd');
  const startId = formatter(start);
  const endId = formatter(end);

  const q = query(
    collection(db, 'special_days'),
    where(documentId(), '>=', startId),
    where(documentId(), '<=', endId)
  );

  const snapshot = await getDocs(q);
  const dict: Record<string, string> = {};
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    if (typeof data.type === 'string') {
      dict[docSnap.id] = data.type;
    }
  });
  return dict;
}

export async function fetchSpecialPeriods(start: Date, end: Date): Promise<Array<{ start: Date; end: Date }>> {
  if (!isFirebaseReady()) {
    return [];
  }
  const db = getDb();
  const snapshot = await getDocs(collection(db, 'special_periods'));
  const periods: Array<{ start: Date; end: Date }> = [];
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const startTs = data.start as Timestamp | undefined;
    const endTs = data.end as Timestamp | undefined;
    if (!startTs || !endTs) {
      return;
    }
    const s = startTs.toDate();
    const e = endTs.toDate();
    if (e >= start && s <= end) {
      periods.push({ start: s, end: e });
    }
  });
  return periods;
}

function getDefaultScheduleForWeekday(date: Date): string | null {
  const weekday = DateTime.fromJSDate(date, { zone: EST_ZONE }).weekday;
  switch (weekday) {
    case 1:
    case 7:
      return null; // weekend
    case 2:
    case 3:
    case 5:
      return 'schedule_mon_thu';
    case 4:
      return 'schedule_wed';
    case 6:
      return 'schedule_fri';
    default:
      return null;
  }
}

export async function loadScheduleByType(type: string): Promise<Block[] | null> {
  return loadJsonSchedule(type);
}

export async function loadBlocksForDate(date: Date): Promise<ScheduleResult> {
  if (await isInSpecialPeriod(date)) {
    return { blocks: [], dayType: 'No School' };
  }

  const specialDayData = await fetchSpecialDayData(date);
  const rawType = specialDayData?.type ?? null;
  const details = specialDayData?.details ?? null;
  let dayTypeLabel = deriveDayTypeLabel(rawType, details);

  if (rawType === 'no_school') {
    return { blocks: [], dayType: dayTypeLabel ?? 'No School' };
  }

  if (rawType === 'custom') {
    if (!dayTypeLabel) {
      dayTypeLabel = await resolveBulletinDayType(date);
    }
    const custom = decodeScheduleFromData(specialDayData) ?? [];
    return { blocks: custom, dayType: dayTypeLabel };
  }

  if (typeof rawType === 'string' && rawType) {
    const typedSchedule = await loadScheduleByType(rawType);
    if (typedSchedule) {
      if (!dayTypeLabel) {
        dayTypeLabel = await resolveBulletinDayType(date);
      }
      return { blocks: typedSchedule, dayType: dayTypeLabel };
    }
  }

  if (!dayTypeLabel) {
    dayTypeLabel = await resolveBulletinDayType(date);
  }

  const fallbackKey = getDefaultScheduleForWeekday(date);
  if (!fallbackKey) {
    return { blocks: [], dayType: dayTypeLabel ?? 'Unknown' };
  }

  const fallbackSchedule = await loadJsonSchedule(fallbackKey);
  return { blocks: fallbackSchedule ?? [], dayType: dayTypeLabel ?? 'Unknown' };
}
