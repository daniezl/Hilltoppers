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
import { DateTime } from 'luxon';
import { getDb } from '../firebase/app';
import { Block, EST_ZONE, SubBlock } from '../types/schedule';
import { firebaseConfig } from '../firebase/config';

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
  const data = snapshot.data();
  return typeof data.type === 'string' ? data.type : null;
}

export async function loadCustomSchedule(date: Date): Promise<Block[] | null> {
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
  const data = snapshot.data();
  const schedule = data.schedule as RawBlock[] | undefined;
  if (!schedule) {
    return null;
  }
  return mapBlocks(schedule);
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

export async function loadBlocksForDate(date: Date): Promise<Block[]> {
  if (await isInSpecialPeriod(date)) {
    return [];
  }

  const type = await fetchTypeFor(date);
  if (type === 'no_school') {
    return [];
  }

  if (type === 'custom') {
    const custom = await loadCustomSchedule(date);
    if (custom) {
      return custom;
    }
    return [];
  }

  if (type) {
    const typedSchedule = await loadScheduleByType(type);
    if (typedSchedule) {
      return typedSchedule;
    }
  }

  const fallbackKey = getDefaultScheduleForWeekday(date);
  if (!fallbackKey) {
    return [];
  }

  const fallbackSchedule = await loadJsonSchedule(fallbackKey);
  return fallbackSchedule ?? [];
}
