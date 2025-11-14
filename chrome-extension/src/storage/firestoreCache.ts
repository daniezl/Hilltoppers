interface CachedSpecialPeriod {
  start: string; // ISO string
  end: string; // ISO string
}

interface CachedSpecialDay {
  type?: string;
  details?: string;
  schedule?: unknown;
}

const CACHE_KEYS = {
  SPECIAL_PERIODS: 'firestore_cache_special_periods',
  SPECIAL_DAYS: 'firestore_cache_special_days',
  DAY_TYPE_RESOLVED: 'firestore_cache_day_type_resolved',
  LAST_FETCH_TIME: 'firestore_cache_last_fetch'
} as const;

const CACHE_DURATION_MS = 15 * 60 * 1000; // 15 minutes - balance between freshness and read reduction
const SPECIAL_PERIODS_CACHE_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours (special periods rarely change, but may be updated)

function getStorage(): typeof chrome.storage.local | null {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return null;
  }
  return chrome.storage.local;
}

function setCacheItem<T>(key: string, value: T): Promise<void> {
  const storage = getStorage();
  if (!storage) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    storage.set({ [key]: value }, () => {
      const err = chrome.runtime?.lastError;
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

function getCacheItem<T>(key: string): Promise<T | null> {
  const storage = getStorage();
  if (!storage) {
    return Promise.resolve(null);
  }
  return new Promise((resolve, reject) => {
    storage.get([key], (result) => {
      const err = chrome.runtime?.lastError;
      if (err) {
        reject(err);
        return;
      }
      const value = result[key] as T | undefined;
      resolve(value ?? null);
    });
  });
}

function isCacheValid(
  cachedData: { timestamp: number } | null,
  cacheDurationMs: number
): boolean {
  if (!cachedData) {
    return false;
  }
  const now = Date.now();
  const age = now - cachedData.timestamp;
  return age < cacheDurationMs;
}

interface CachedSpecialPeriods {
  timestamp: number;
  periods: CachedSpecialPeriod[];
}

export async function getCachedSpecialPeriods(): Promise<Array<{ start: Date; end: Date }> | null> {
  const cached = await getCacheItem<CachedSpecialPeriods>(CACHE_KEYS.SPECIAL_PERIODS);
  if (isCacheValid(cached, SPECIAL_PERIODS_CACHE_DURATION_MS)) {
    // Convert ISO strings back to Date objects
    return cached!.periods.map((period) => ({
      start: new Date(period.start),
      end: new Date(period.end)
    }));
  }
  return null;
}

export async function setCachedSpecialPeriods(periods: Array<{ start: Date; end: Date }>): Promise<void> {
  // Convert Date objects to ISO strings for storage
  const serializedPeriods: CachedSpecialPeriod[] = periods.map((period) => ({
    start: period.start.toISOString(),
    end: period.end.toISOString()
  }));
  
  const cacheData: CachedSpecialPeriods = {
    timestamp: Date.now(),
    periods: serializedPeriods
  };
  await setCacheItem(CACHE_KEYS.SPECIAL_PERIODS, cacheData);
}

interface CachedSpecialDays {
  timestamp: number;
  days: Record<string, CachedSpecialDay>;
}

export async function getCachedSpecialDay(dateKey: string): Promise<CachedSpecialDay | null> {
  const cached = await getCacheItem<CachedSpecialDays>(CACHE_KEYS.SPECIAL_DAYS);
  if (!cached || !isCacheValid(cached, CACHE_DURATION_MS)) {
    return null;
  }
  return cached.days[dateKey] ?? null;
}

export async function setCachedSpecialDay(
  dateKey: string,
  day: CachedSpecialDay
): Promise<void> {
  const cached = await getCacheItem<CachedSpecialDays>(CACHE_KEYS.SPECIAL_DAYS);
  const days = cached?.days ?? {};
  const oldDay = days[dateKey];
  
  // If data changed, invalidate related caches
  if (oldDay && (
    oldDay.type !== day.type ||
    oldDay.details !== day.details ||
    JSON.stringify(oldDay.schedule) !== JSON.stringify(day.schedule)
  )) {
    // Clear day type cache for this date since it may have changed
    const dayTypeCache = await getCacheItem<CachedDayType>(CACHE_KEYS.DAY_TYPE_RESOLVED);
    if (dayTypeCache && dayTypeCache.dayTypes[dateKey]) {
      delete dayTypeCache.dayTypes[dateKey];
      await setCacheItem(CACHE_KEYS.DAY_TYPE_RESOLVED, dayTypeCache);
    }
  }
  
  days[dateKey] = day;
  
  const cacheData: CachedSpecialDays = {
    timestamp: cached?.timestamp ?? Date.now(),
    days
  };
  await setCacheItem(CACHE_KEYS.SPECIAL_DAYS, cacheData);
}

export async function getCachedSpecialDaysDict(
  startKey: string,
  endKey: string
): Promise<Record<string, string> | null> {
  const cached = await getCacheItem<CachedSpecialDays>(CACHE_KEYS.SPECIAL_DAYS);
  if (!cached || !isCacheValid(cached, CACHE_DURATION_MS)) {
    return null;
  }
  
  const dict: Record<string, string> = {};
  for (const [key, day] of Object.entries(cached.days)) {
    if (key >= startKey && key <= endKey && day.type) {
      dict[key] = day.type;
    }
  }
  return dict;
}

export async function setCachedSpecialDaysDict(
  dict: Record<string, string>
): Promise<void> {
  const cached = await getCacheItem<CachedSpecialDays>(CACHE_KEYS.SPECIAL_DAYS);
  const days = cached?.days ?? {};
  const dayTypeCache = await getCacheItem<CachedDayType>(CACHE_KEYS.DAY_TYPE_RESOLVED);
  let dayTypeCacheUpdated = false;
  
  for (const [key, type] of Object.entries(dict)) {
    const oldType = days[key]?.type;
    if (!days[key]) {
      days[key] = { type };
    } else {
      days[key].type = type;
    }
    
    // If type changed, invalidate day type cache for this date
    if (oldType && oldType !== type && dayTypeCache && dayTypeCache.dayTypes[key]) {
      delete dayTypeCache.dayTypes[key];
      dayTypeCacheUpdated = true;
    }
  }
  
  if (dayTypeCacheUpdated) {
    await setCacheItem(CACHE_KEYS.DAY_TYPE_RESOLVED, dayTypeCache!);
  }
  
  const cacheData: CachedSpecialDays = {
    timestamp: cached?.timestamp ?? Date.now(),
    days
  };
  await setCacheItem(CACHE_KEYS.SPECIAL_DAYS, cacheData);
}

interface CachedDayType {
  timestamp: number;
  dayTypes: Record<string, string>; // dateKey -> dayType
}

const DAY_TYPE_CACHE_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours - day types may be updated during the day

export async function getCachedDayType(dateKey: string): Promise<string | null> {
  const cached = await getCacheItem<CachedDayType>(CACHE_KEYS.DAY_TYPE_RESOLVED);
  if (!cached || !isCacheValid(cached, DAY_TYPE_CACHE_DURATION_MS)) {
    return null;
  }
  return cached.dayTypes[dateKey] ?? null;
}

export async function setCachedDayType(dateKey: string, dayType: string): Promise<void> {
  const cached = await getCacheItem<CachedDayType>(CACHE_KEYS.DAY_TYPE_RESOLVED);
  const dayTypes = cached?.dayTypes ?? {};
  dayTypes[dateKey] = dayType;
  
  const cacheData: CachedDayType = {
    timestamp: cached?.timestamp ?? Date.now(),
    dayTypes
  };
  await setCacheItem(CACHE_KEYS.DAY_TYPE_RESOLVED, cacheData);
}

export async function clearCache(): Promise<void> {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  return new Promise((resolve, reject) => {
    storage.remove(
      [CACHE_KEYS.SPECIAL_PERIODS, CACHE_KEYS.SPECIAL_DAYS, CACHE_KEYS.DAY_TYPE_RESOLVED, CACHE_KEYS.LAST_FETCH_TIME],
      () => {
        const err = chrome.runtime?.lastError;
        if (err) {
          reject(err);
          return;
        }
        resolve();
      }
    );
  });
}

