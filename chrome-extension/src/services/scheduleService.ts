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
  getAllCachedSpecialDays,
  setCachedSpecialDay,
  removeCachedSpecialDay,
  getCachedSpecialDaysDict,
  setCachedSpecialDaysDict
} from '../storage/localCache';

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

type SpecialDayRecord = DocumentData & {
  type?: string;
  details?: string;
  color?: string;
  schedule?: RawBlock[];
};

export interface ScheduleResult {
  blocks: Block[];
  dayType: string | null;
  details?: string | null;
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

// Cloudflare Pages URL - 统一从静态 JSON 读取（不走 Worker API）
const CLOUDFLARE_BASE_URL = import.meta.env.VITE_CLOUDFLARE_SCHEDULE_URL || 'https://hilltoppers.pages.dev';

// 调试：检查环境变量是否正确加载
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  console.log('[scheduleService] Cloudflare Pages URL:', CLOUDFLARE_BASE_URL);
}

function getCloudflareSpecialDaysUrl(): string {
  // 从静态站点读取
  return `${CLOUDFLARE_BASE_URL}/special_days.json`;
}

function getCloudflareSpecialPeriodsUrl(): string {
  // 从静态站点读取
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
let cachedSpecialPeriodsData: Array<{ start: string; end: string; details?: string }> | null = null;

async function loadSpecialDaysFromCloudflare(forceRefresh = false): Promise<Record<string, SpecialDayRecord> | null> {
  if (cachedSpecialDaysData && !forceRefresh) {
    return cachedSpecialDaysData;
  }
  
  const url = getCloudflareSpecialDaysUrl();
  if (!url) {
    console.warn('[scheduleService] Cloudflare URL not configured, VITE_CLOUDFLARE_SCHEDULE_URL is empty');
    return null;
  }
  
    try {
      console.info('[scheduleService] Loading special_days from Cloudflare:', url);
      
      // 使用 cache: 'no-cache' 强制绕过浏览器缓存，确保从服务器获取
      // 对于 Chrome 扩展，避免添加可能触发 CORS 预检请求的自定义 headers
      const response = await fetch(url, {
        cache: 'no-cache'
      });
      
      // 检查 HTTP 状态码，判断是否真的从服务器获取了数据
      if (!response.ok) {
        // HTTP 错误（4xx, 5xx），说明网络请求失败或服务器错误
        console.warn(`[scheduleService] Failed to load special_days from Cloudflare: HTTP ${response.status}`);
        return null;
      }
      
      // HTTP 200 表示成功从服务器获取了响应
      // 检查响应头，确认这是真实的服务器响应
      const responseDate = response.headers.get('Date');
      const contentType = response.headers.get('Content-Type');
      const contentLength = response.headers.get('Content-Length');
      
      // Cloudflare Pages 部署相关信息
      const cfPagesDeploymentId = response.headers.get('cf-pages-deployment-id');
      const cfPagesVersion = response.headers.get('cf-pages-version');
      const cfRay = response.headers.get('cf-ray');
      const server = response.headers.get('server');
      
      // 获取所有响应头（用于调试）
      const allHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        allHeaders[key] = value;
      });
      
      const text = await response.text();
      
      try {
        const data = JSON.parse(text) as Record<string, SpecialDayRecord>;
        const hasData = Object.keys(data).length > 0;
        
        // 如果 HTTP 200 且成功解析 JSON，说明真的从 Cloudflare 获取了数据
        console.info('[scheduleService] Successfully fetched from Cloudflare', {
          hasData,
          dataKeysCount: Object.keys(data).length,
          httpStatus: response.status,
          responseDate,
          contentType,
          contentLength,
          responseSize: text.length,
          // Cloudflare Pages 部署信息
          cfPagesDeploymentId: cfPagesDeploymentId || 'not available',
          cfPagesVersion: cfPagesVersion || 'not available',
          cfRay: cfRay || 'not available',
          server: server || 'not available',
          // 所有响应头（用于调试，可以查看是否有其他部署相关的 header）
          allHeaders: Object.keys(allHeaders).filter(key => 
            key.toLowerCase().includes('cf-') || 
            key.toLowerCase().includes('deploy') ||
            key.toLowerCase().includes('version')
          ).reduce((acc, key) => {
            acc[key] = allHeaders[key];
            return acc;
          }, {} as Record<string, string>)
        });
        
        // 如果 HTTP 200 且成功解析 JSON，说明真的从 Cloudflare 获取了数据
        // 无论是否为空，都要缓存到内存（因为这是真实的服务器响应）
        cachedSpecialDaysData = data;
        if (!hasData) {
          console.info('[scheduleService] Cloudflare returned empty JSON (server confirmed), cached to memory');
        } else {
          console.info('[scheduleService] Cached special_days data to memory');
        }
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

async function loadSpecialPeriodsFromCloudflare(forceRefresh = false): Promise<Array<{ start: string; end: string; details?: string }> | null> {
  // 强制刷新时，清除内存缓存，确保从网络加载最新数据
  if (forceRefresh) {
    cachedSpecialPeriodsData = null;
  }
  
  if (cachedSpecialPeriodsData && !forceRefresh) {
    return cachedSpecialPeriodsData;
  }
  
  const url = getCloudflareSpecialPeriodsUrl();
  if (!url) {
    console.warn('[scheduleService] Cloudflare URL not configured, VITE_CLOUDFLARE_SCHEDULE_URL is empty');
    return null;
  }
  
  try {
    console.info('[scheduleService] Loading special_periods from Cloudflare:', url);
    // 对于 Chrome 扩展，避免添加可能触发 CORS 预检请求的自定义 headers
    const response = await fetch(url, {
      cache: 'no-cache'
    });
    if (!response.ok) {
      console.warn(`[scheduleService] Failed to load special_periods from Cloudflare: HTTP ${response.status}`);
      return null;
    }
    const text = await response.text();
    try {
      // Expect date strings in EST format: "yyyy-LL-dd" (e.g., "2025-11-30")
      const data = JSON.parse(text) as Array<{ start: string; end: string; details?: string }>;
      
      // Normalize date strings to "yyyy-MM-dd" format (handles both "2025-11-30" and "2026-1-6")
      const normalizeDateString = (dateStr: string): string | null => {
        if (!dateStr) return null;
        
        // Check if already in correct format "yyyy-MM-dd"
        const correctFormatRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (correctFormatRegex.test(dateStr)) {
          return dateStr;
        }
        
        // Try to parse and normalize formats like "2026-1-6" -> "2026-01-06"
        const flexibleFormatRegex = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
        const match = dateStr.match(flexibleFormatRegex);
        if (match) {
          const [, year, month, day] = match;
          // Pad month and day with zeros
          const normalizedMonth = month.padStart(2, '0');
          const normalizedDay = day.padStart(2, '0');
          return `${year}-${normalizedMonth}-${normalizedDay}`;
        }
        
        return null;
      };
      
      // Validate and normalize periods
      const validPeriods = data
        .map((period) => {
          // Filter out periods without start or end
          if (!period.start || !period.end) {
            console.warn('[scheduleService] Period missing start or end field, skipping', period);
            return null;
          }
          
          // Normalize date strings
          const normalizedStart = normalizeDateString(period.start);
          const normalizedEnd = normalizeDateString(period.end);
          
          if (!normalizedStart || !normalizedEnd) {
            console.warn('[scheduleService] Invalid date format in special_periods, expected "yyyy-MM-dd" or "yyyy-M-d", skipping', period);
            return null;
          }
          
          return {
            start: normalizedStart,
            end: normalizedEnd,
            details: period.details
          };
        })
        .filter((period): period is { start: string; end: string; details?: string } => period !== null);
      cachedSpecialPeriodsData = validPeriods;
      if (validPeriods.length !== data.length) {
        console.info(`[scheduleService] Filtered out ${data.length - validPeriods.length} invalid periods, ${validPeriods.length} valid periods remaining`);
      } else {
        console.info('[scheduleService] Successfully loaded special_periods from Cloudflare', { count: validPeriods.length });
      }
      return validPeriods;
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
  
  // 从 Cloudflare 加载（强制刷新，使用 cache: 'no-cache' 绕过浏览器缓存）
  // 同时刷新 special periods，确保数据同步
  const cloudflareDataPromise = loadSpecialDaysFromCloudflare(true);
  const cloudflarePeriodsPromise = loadSpecialPeriodsFromCloudflare(true);
  const [cloudflareData, cloudflarePeriods] = await Promise.all([cloudflareDataPromise, cloudflarePeriodsPromise]);
  
  // 如果成功加载了 periods，更新缓存
  if (cloudflarePeriods) {
    await setCachedSpecialPeriods(cloudflarePeriods);
  }
  
  if (cloudflareData === null) {
    // loadSpecialDaysFromCloudflare 返回 null 表示：
    // - 网络错误（fetch 抛出异常，如网络断开）
    // - HTTP 错误（response.ok === false，如 404, 500）
    // - JSON 解析错误
    // 这些情况都说明没有成功从 Cloudflare 获取数据，使用缓存
    const cached = await getCachedSpecialDay(formatter);
    if (cached) {
      console.info('[scheduleService] Cloudflare fetch failed (network/HTTP/parse error), using cached data for', formatter);
      return cached as SpecialDayRecord;
    }
    return null;
  }
  
  // cloudflareData 不为 null，说明：
  // - HTTP 200 成功（response.ok === true）
  // - JSON 解析成功
  // - 这是从 Cloudflare 服务器获取的真实响应（因为使用了 cache: 'no-cache'）
  // 所以我们可以信任这个响应，即使它是空对象
  
  // 文件有变化时，比较数据并只更新变化的部分
  const dataKeys = Object.keys(cloudflareData);
  if (dataKeys.length > 0) {
    // 获取当前缓存，用于比较
    const cachedDays = await getAllCachedSpecialDays();
    let updateCount = 0;
    
    // 只更新变化的数据
    for (const dateKey of dataKeys) {
      const newData = cloudflareData[dateKey];
      const cachedData = cachedDays?.[dateKey];
      
      // 比较数据是否相同
      const isSame = cachedData && 
        cachedData.type === newData.type &&
        cachedData.details === newData.details &&
        JSON.stringify(cachedData.schedule) === JSON.stringify(newData.schedule);
      
      if (!isSame) {
        // 数据不同，更新缓存
        await setCachedSpecialDay(dateKey, {
          type: newData.type,
          details: newData.details,
          schedule: newData.schedule
        });
        updateCount++;
      }
    }
    
    if (updateCount > 0) {
      console.info('[scheduleService] Updated cache for', updateCount, 'out of', dataKeys.length, 'dates');
    } else {
      console.info('[scheduleService] No cache updates needed, all data unchanged');
    }
  } else {
    console.info('[scheduleService] Cloudflare returned empty data, no cache updates');
  }
  
  // 返回今天的数据（如果存在）
  if (cloudflareData[formatter]) {
    return cloudflareData[formatter];
  } else {
    // 今天的数据不存在，使用之前的缓存（如果有）
    const cached = await getCachedSpecialDay(formatter);
    if (cached) {
      console.info('[scheduleService] Date not found in Cloudflare data, using cached data for', formatter);
      return cached as SpecialDayRecord;
    }
    // 没有缓存，返回 null
    return null;
  }
}

function decodeScheduleFromData(data: SpecialDayRecord | null): Block[] | null {
  if (!data || !Array.isArray(data.schedule)) {
    return null;
  }
  return mapBlocks(data.schedule);
}

function deriveDayTypeLabel(rawType?: string | null, color?: string | null): string | null {
  const normalize = (value?: string | null): string | null => {
    if (!value) {
      return null;
    }
    const lower = value.trim().toLowerCase();
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

export async function isInSpecialPeriod(date: Date, forceRefresh = false): Promise<boolean> {
  // Convert date to EST date string format: "yyyy-LL-dd"
  const dateStr = DateTime.fromJSDate(date, { zone: EST_ZONE }).toFormat('yyyy-LL-dd');
  
  // 强制刷新时，优先从网络加载最新数据
  if (forceRefresh) {
    const cloudflarePeriods = await loadSpecialPeriodsFromCloudflare(true);
    // cloudflarePeriods 可能是空数组 []，这也需要更新缓存（清除旧的 periods）
    if (cloudflarePeriods !== null) {
      // 先更新缓存，确保后续使用最新数据
      await setCachedSpecialPeriods(cloudflarePeriods);
      
      // 然后基于最新的 periods 检查日期是否在其中
      if (cloudflarePeriods.length > 0) {
        for (const period of cloudflarePeriods) {
          // Ensure period has valid start and end before comparing
          if (period.start && period.end && dateStr >= period.start && dateStr <= period.end) {
            return true;
          }
        }
      }
      // 没有匹配的 period 或数组为空，返回 false
      return false;
    }
    // 网络加载失败（返回 null），fallback 到缓存
  }
  
  // 非强制刷新时，先尝试使用缓存
  const cachedPeriods = await getCachedSpecialPeriods();
  if (cachedPeriods && cachedPeriods.length > 0) {
    for (const period of cachedPeriods) {
      // Ensure period has valid start and end before comparing
      if (period.start && period.end && dateStr >= period.start && dateStr <= period.end) {
        return true;
      }
    }
    return false;
  }
  
  // 缓存无效时，从 Cloudflare 加载
  const cloudflarePeriods = await loadSpecialPeriodsFromCloudflare();
  // cloudflarePeriods 可能是空数组 []，这也需要更新缓存（清除旧的 periods）
  if (cloudflarePeriods !== null) {
    // 先更新缓存
    await setCachedSpecialPeriods(cloudflarePeriods);
    
    // 然后检查日期是否在其中
    if (cloudflarePeriods.length > 0) {
      for (const period of cloudflarePeriods) {
        // Ensure period has valid start and end before comparing
        if (period.start && period.end && dateStr >= period.start && dateStr <= period.end) {
          return true;
        }
      }
    }
    // 没有匹配的 period 或数组为空，返回 false
    return false;
  }
  
  return false;
}

async function getSpecialPeriodDetails(date: Date, forceRefresh = false): Promise<string | null> {
  // Convert date to EST date string format: "yyyy-LL-dd"
  const dateStr = DateTime.fromJSDate(date, { zone: EST_ZONE }).toFormat('yyyy-LL-dd');
  
  // 强制刷新时，优先从网络加载最新数据
  if (forceRefresh) {
    const cloudflarePeriods = await loadSpecialPeriodsFromCloudflare(true);
    if (cloudflarePeriods !== null) {
      await setCachedSpecialPeriods(cloudflarePeriods);
      
      if (cloudflarePeriods.length > 0) {
        for (const period of cloudflarePeriods) {
          if (period.start && period.end && dateStr >= period.start && dateStr <= period.end) {
            return period.details ?? null;
          }
        }
      }
      return null;
    }
  }
  
  // 非强制刷新时，先尝试使用缓存
  const cachedPeriods = await getCachedSpecialPeriods();
  if (cachedPeriods && cachedPeriods.length > 0) {
    for (const period of cachedPeriods) {
      if (period.start && period.end && dateStr >= period.start && dateStr <= period.end) {
        return period.details ?? null;
      }
    }
    return null;
  }
  
  // 缓存无效时，从 Cloudflare 加载
  const cloudflarePeriods = await loadSpecialPeriodsFromCloudflare();
  if (cloudflarePeriods !== null) {
    await setCachedSpecialPeriods(cloudflarePeriods);
    
    if (cloudflarePeriods.length > 0) {
      for (const period of cloudflarePeriods) {
        if (period.start && period.end && dateStr >= period.start && dateStr <= period.end) {
          return period.details ?? null;
        }
      }
    }
    return null;
  }
  
  return null;
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

export async function fetchSpecialPeriods(start: Date, end: Date): Promise<Array<{ start: string; end: string; details?: string }>> {
  // Convert dates to EST date strings for comparison
  const startStr = DateTime.fromJSDate(start, { zone: EST_ZONE }).toFormat('yyyy-LL-dd');
  const endStr = DateTime.fromJSDate(end, { zone: EST_ZONE }).toFormat('yyyy-LL-dd');
  
  // Try cache first
  const cachedPeriods = await getCachedSpecialPeriods();
  if (cachedPeriods && cachedPeriods.length > 0) {
    // Filter by date range (comparing date strings) and ensure valid periods
    return cachedPeriods.filter((period) => {
      return period.start && period.end && period.end >= startStr && period.start <= endStr;
    });
  }
  
  // 从 Cloudflare 加载
  const cloudflarePeriods = await loadSpecialPeriodsFromCloudflare();
  if (cloudflarePeriods && cloudflarePeriods.length > 0) {
    // Cache the periods
    await setCachedSpecialPeriods(cloudflarePeriods);
    // Filter by date range (comparing date strings) and ensure valid periods
    return cloudflarePeriods.filter((period) => {
      return period.start && period.end && period.end >= startStr && period.start <= endStr;
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

export async function loadBlocksForDate(date: Date, forceRefresh = false): Promise<ScheduleResult> {
  const requestKey = DateTime.fromJSDate(date, { zone: EST_ZONE }).toFormat('yyyy-LL-dd');
  console.info('[scheduleService] loadBlocksForDate start', requestKey, { forceRefresh });

  if (await isInSpecialPeriod(date, forceRefresh)) {
    console.info('[scheduleService] Date falls within special period, returning No School');
    const periodDetails = await getSpecialPeriodDetails(date, forceRefresh);
    return { blocks: [], dayType: 'No School', details: periodDetails };
  }

  const specialDayData = await fetchSpecialDayData(date);
  const rawType = specialDayData?.type ?? null;
  const details = specialDayData?.details ?? null;
  const color = specialDayData?.color ?? null;
  if (specialDayData) {
    console.info('[scheduleService] Special day record found', {
      type: rawType,
      details,
      color
    });
  } else {
    console.info('[scheduleService] No special day record for', requestKey);
  }
  let dayTypeLabel = deriveDayTypeLabel(rawType, color);

  if (rawType === 'no_school') {
    console.info('[scheduleService] Raw type no_school, returning empty schedule');
    return { blocks: [], dayType: dayTypeLabel ?? 'No School', details: details ?? null };
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
    // If it's weekend and not a special day, return No School with weekend details
    if (!rawType) {
      console.info('[scheduleService] Weekend (not special day), returning No School');
      return { blocks: [], dayType: 'No School', details: 'Weekend' };
    }
    console.info('[scheduleService] No fallback key (likely weekend)', { dayTypeLabel });
    return { blocks: [], dayType: dayTypeLabel ?? null };
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
  return { blocks: fallbackSchedule ?? [], dayType: dayTypeLabel };
}
