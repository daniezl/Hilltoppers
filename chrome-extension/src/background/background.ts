
import { DateTime } from 'luxon';
import { loadBlocksForDate } from '../services/scheduleService';
import {
  DiningMenuError,
  type DiningPeriod,
  type DiningMenuResult,
  loadDiningMenuFirstItems
} from '../services/diningMenuService';
import { Block, EST_ZONE, parseBlockTime } from '../types/schedule';
import { type TimeFormat } from '../storage/schedulePreferences';
import { isWithinSchoolHours, getNextSchoolHoursStart } from '../utils/timeUtils';

type CountdownKind = 'current' | 'upcoming' | 'idle' | 'none';

const REFRESH_ALARM = 'schedule-refresh';
const REFRESH_INTERVAL_MINUTES = 60;
const ICON_TICK_ALARM = 'schedule-icon-tick';
const ICON_TICK_INTERVAL_MINUTES = 1;
const ICON_PRECISE_ALARM = 'schedule-icon-precise';

let cachedSchedule: Block[] = [];
let cachedDateKey = '';
let cachedDayType: string | null = null;
let cachedDetails: string | null = null;
let cachedNetworkFailed = false;
let cachedTimeFormat: TimeFormat = '12h';
let cachedTimestamp: number | null = null;
let refreshInFlight: Promise<void> | null = null;
const diningMenuCache: Partial<Record<DiningPeriod, DiningMenuResult>> = {};
const diningRefreshTimestamps: Partial<Record<DiningPeriod, number>> = {};
const diningRefreshInFlight: Partial<Record<DiningPeriod, Promise<void>>> = {};
const lastForcedDiningRefreshDateByPeriod: Partial<Record<DiningPeriod, string>> = {};
// Menu is static on Cloudflare; keep a short TTL to reduce repeat fetches while staying near publish cadence (~30m).
const DINING_CACHE_TTL_MS = 30 * 60 * 1000;

function getTodayKey(): string {
  return DateTime.now().setZone(EST_ZONE).toFormat('yyyy-LL-dd');
}

function getBaseDate(): Date {
  if (cachedDateKey) {
    const parsed = DateTime.fromFormat(cachedDateKey, 'yyyy-LL-dd', { zone: EST_ZONE, setZone: true });
    if (parsed.isValid) {
      return parsed.startOf('day').toJSDate();
    }
  }
  return DateTime.now().setZone(EST_ZONE).startOf('day').toJSDate();
}

function formatTime(date: Date, format: TimeFormat): string {
  const dt = DateTime.fromJSDate(date, { zone: EST_ZONE });
  return format === '24h' ? dt.toFormat('HH:mm') : dt.toFormat('h:mm');
}

function formatCountdownLabel(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return '00';
  }
  if (minutes >= 99) {
    return '99';
  }
  return Math.max(0, Math.ceil(minutes)).toString().padStart(2, '0');
}

function formatDurationText(minutes: number): string {
  const safeMinutes = Math.max(0, Math.ceil(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  if (hours > 0 && mins > 0) {
    return `${hours}h ${mins}m`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  return `${mins}m`;
}

function determineCountdown(now: Date = DateTime.now().setZone(EST_ZONE).toJSDate()): {
  label: string;
  tooltip: string;
  kind: CountdownKind;
  useStaticIcon: boolean;
} {
  if (!cachedSchedule.length) {
    const label = cachedDayType ? cachedDayType.slice(0, 2).toUpperCase() : '--';
    const tooltip = cachedDayType ?? 'No schedule available';
    return { label, tooltip, kind: 'idle', useStaticIcon: true };
  }

  const baseDate = getBaseDate();
  const nowMs = now.getTime();

  for (let i = 0; i < cachedSchedule.length; i += 1) {
    const block = cachedSchedule[i];
    const start = parseBlockTime(block.start, baseDate);
    const end = parseBlockTime(block.end, baseDate);

    const startMs = start.getTime();
    const endMs = end.getTime();

    if (nowMs >= startMs && nowMs < endMs) {
      const remainingMinutes = (endMs - nowMs) / 60000;
      const label = formatCountdownLabel(remainingMinutes);
      const endDisplay = formatTime(end, cachedTimeFormat);
      return {
        label,
        tooltip: `${block.name} ends in ${formatDurationText(remainingMinutes)} (${endDisplay})`,
        kind: 'current',
        useStaticIcon: remainingMinutes > 99
      };
    }

    if (nowMs < startMs) {
      const minutesUntilStart = (startMs - nowMs) / 60000;
      const label = formatCountdownLabel(minutesUntilStart);
      const startDisplay = formatTime(start, cachedTimeFormat);
      return {
        label,
        tooltip: `Next: ${block.name} at ${startDisplay} (${formatDurationText(minutesUntilStart)} away)`,
        kind: 'upcoming',
        useStaticIcon: minutesUntilStart > 99
      };
    }
  }

  return {
    label: '--',
    tooltip: cachedDayType ? `${cachedDayType} · No remaining blocks` : 'Schedule complete',
    kind: 'idle',
    useStaticIcon: true
  };
}

function createIconImageData(label: string, kind: CountdownKind): { [index: number]: ImageData } | null {
  if (typeof OffscreenCanvas === 'undefined') {
    console.debug('[background] OffscreenCanvas unavailable; skipping icon render');
    return null;
  }

  const isUpcoming = kind === 'upcoming';
  const background = isUpcoming ? '#ffffff' : '#213e26';
  const textColor = isUpcoming ? '#1f6f2b' : '#ffffff';
  const sizes = [16, 32, 48, 128];
  const imageData: { [index: number]: ImageData } = {};

  for (const size of sizes) {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      continue;
    }

    ctx.fillStyle = background;
    ctx.beginPath();
    const radius = Math.round(size * 0.23);
    const d = size;
    ctx.moveTo(radius, 0);
    ctx.arcTo(d, 0, d, d, radius);
    ctx.arcTo(d, d, 0, d, radius);
    ctx.arcTo(0, d, 0, 0, radius);
    ctx.arcTo(0, 0, d, 0, radius);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = textColor;
    const fontSize = label.length <= 2 ? Math.round(size * 0.65) : Math.round(size * 0.48);
    ctx.font = `${fontSize}px "Segoe UI", "Helvetica Neue", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, size / 2, size / 2 + (size >= 32 ? 1 : 0));

    imageData[size] = ctx.getImageData(0, 0, size, size);
  }

  return Object.keys(imageData).length > 0 ? imageData : null;
}

async function schedulePreciseIconUpdate(): Promise<void> {
  try {
    const now = DateTime.now().setZone(EST_ZONE).toJSDate();
    const baseDate = getBaseDate();
    const nowMs = now.getTime();
    let nextTransitionMs: number | null = null;

    // Find the next state transition time
    for (let i = 0; i < cachedSchedule.length; i += 1) {
      const block = cachedSchedule[i];
      const start = parseBlockTime(block.start, baseDate);
      const end = parseBlockTime(block.end, baseDate);
      
      const startMs = start.getTime();
      const endMs = end.getTime();
      
      // If we're in a block, next transition is when it ends
      if (nowMs >= startMs && nowMs < endMs) {
        nextTransitionMs = endMs;
        break;
      }
      
      // If we're before this block, next transition is when it starts
      if (nowMs < startMs) {
        nextTransitionMs = startMs;
        break;
      }
    }

    // Clear any existing precise alarm
    await chrome.alarms.clear(ICON_PRECISE_ALARM);

    // Schedule alarm for next transition if found and within reasonable time
    if (nextTransitionMs && nextTransitionMs > nowMs) {
      const delayMs = nextTransitionMs - nowMs;
      // Only schedule if transition is within next 2 hours to avoid stale alarms
      if (delayMs < 2 * 60 * 60 * 1000) {
        await chrome.alarms.create(ICON_PRECISE_ALARM, {
          when: nextTransitionMs + 500 // Add 500ms buffer to ensure we're past the transition
        });
        console.debug('[background] Scheduled precise icon update in', Math.round(delayMs / 1000), 'seconds');
      }
    } else {
      // No next transition found (all classes ended or no schedule)
      // Ensure the periodic icon tick alarm is active as a fallback
      ensureIconAlarm();
      console.debug('[background] No next transition found, relying on periodic icon tick alarm');
    }
  } catch (error) {
    console.debug('[background] Failed to schedule precise icon update', error);
    // Ensure icon alarm is active even if scheduling fails
    ensureIconAlarm();
  }
}

async function updateActionIcon(): Promise<void> {
  const { label, tooltip, kind, useStaticIcon } = determineCountdown();
  try {
    if (!useStaticIcon && (kind === 'current' || kind === 'upcoming')) {
      const imageData = createIconImageData(label, kind);
      if (imageData) {
        await chrome.action.setIcon({ imageData });
      } else {
        await chrome.action.setIcon({ path: {
          128: 'icons/icon128.png'
        }});
      }
    } else {
      await chrome.action.setIcon({ path: {
        128: 'icons/icon128.png'
      }});
    }
    await chrome.action.setTitle({ title: tooltip });
    
    // Schedule precise alarm for next state transition
    await schedulePreciseIconUpdate();
    
    // Ensure icon alarm is active even when using static icon (for minute-aligned updates)
    if (useStaticIcon) {
      ensureIconAlarm();
    }
  } catch (error) {
    console.debug('[background] Failed to update action icon', error);
  }
}

async function refreshSchedule(forceRefresh = false): Promise<void> {
  if (refreshInFlight) {
    await refreshInFlight;
    return;
  }

  refreshInFlight = (async () => {
    const previousSchedule = [...cachedSchedule];
    const previousDateKey = cachedDateKey;
    const previousDayType = cachedDayType;
    const previousDetails = cachedDetails;
    const previousTimestamp = cachedTimestamp;
    
    try {
      const today = DateTime.now().setZone(EST_ZONE).startOf('day').toJSDate();
      const todayKey = getTodayKey();
      console.info('[background] Refreshing schedule for', todayKey, { forceRefresh });
      const scheduleResult = await loadBlocksForDate(today, forceRefresh);
      const { blocks, dayType, details, networkFailed } = scheduleResult;
      
      const hasValidBlocks = blocks.length > 0;
      const hasValidDayType = dayType !== null;
      const isValidData = hasValidBlocks || hasValidDayType;
      const previousHadBlocks = previousDateKey === todayKey && previousSchedule.length > 0;

      // When network failed and the new result has no blocks but the
      // previous cache for today DID have blocks, keep the old cache.
      // This prevents a stale "No School" from overwriting a good schedule.
      if (networkFailed && !hasValidBlocks && previousHadBlocks) {
        console.warn('[background] Network failed and refresh lost blocks, keeping previous cache', {
          previousBlockCount: previousSchedule.length,
          previousDayType,
          newDayType: dayType
        });
        cachedSchedule = previousSchedule;
        cachedDateKey = previousDateKey;
        cachedDayType = previousDayType;
        cachedDetails = previousDetails;
        cachedNetworkFailed = true;
      } else if (isValidData) {
        cachedSchedule = blocks;
        cachedDateKey = todayKey;
        cachedDayType = dayType ?? null;
        cachedDetails = details ?? null;
        cachedNetworkFailed = networkFailed ?? false;
        cachedTimestamp = Date.now();
        console.info('[background] Refresh complete', {
          dateKey: cachedDateKey,
          blockCount: cachedSchedule.length,
          dayType: cachedDayType,
          details: cachedDetails,
          networkFailed: cachedNetworkFailed,
          cachedAt: new Date(cachedTimestamp).toISOString()
        });
      } else {
        if (previousDateKey === todayKey && (previousSchedule.length > 0 || previousDayType)) {
          console.warn('[background] Refresh returned invalid data, keeping previous cache for today');
          cachedSchedule = previousSchedule;
          cachedDateKey = previousDateKey;
          cachedDayType = previousDayType;
          cachedDetails = previousDetails;
          cachedNetworkFailed = networkFailed ?? false;
        } else {
          cachedSchedule = blocks;
          cachedDateKey = todayKey;
          cachedDayType = dayType ?? null;
          cachedDetails = details ?? null;
          cachedNetworkFailed = networkFailed ?? false;
          cachedTimestamp = Date.now();
          console.warn('[background] Refresh returned invalid data, no previous cache available');
        }
      }
      
      if (typeof chrome !== 'undefined') {
        chrome.runtime.sendMessage(
          {
            type: 'scheduleUpdated',
            payload: {
              dateKey: cachedDateKey,
              blocks: cachedSchedule,
              dayType: cachedDayType,
              details: cachedDetails,
              networkFailed: cachedNetworkFailed
            }
          },
          () => {
            const error = chrome.runtime.lastError;
            if (error) {
              console.debug('[background] scheduleUpdated sendMessage lastError', error.message);
            }
          }
        );
      }
    } catch (error) {
      console.error('[background] Failed to refresh schedule', error);
      const todayKey = getTodayKey();
      cachedNetworkFailed = true;
      if (previousDateKey === todayKey && (previousSchedule.length > 0 || previousDayType)) {
        const cacheAge = previousTimestamp ? Date.now() - previousTimestamp : null;
        const cacheAgeMinutes = cacheAge ? Math.round(cacheAge / 60000) : null;
        console.info('[background] Restoring previous cache due to refresh error', {
          previousBlockCount: previousSchedule.length,
          previousDayType: previousDayType,
          cacheTimestamp: previousTimestamp ? new Date(previousTimestamp).toISOString() : null,
          cacheAgeMinutes: cacheAgeMinutes
        });
        cachedSchedule = previousSchedule;
        cachedDateKey = previousDateKey;
        cachedDayType = previousDayType;
        cachedDetails = previousDetails;
      } else {
        cachedDateKey = todayKey;
        console.warn('[background] Refresh failed and no valid previous cache for today');
      }
    } finally {
      await updateActionIcon();
      refreshInFlight = null;
    }
  })();

  await refreshInFlight;
}

async function refreshDiningMenu(period: DiningPeriod, forceRefresh = false): Promise<void> {
  if (diningRefreshInFlight[period]) {
    await diningRefreshInFlight[period];
    return;
  }

  const now = Date.now();
  const cachedMenu = diningMenuCache[period];
  const cachedTimestamp = diningRefreshTimestamps[period];
  if (!forceRefresh && cachedMenu && cachedTimestamp && now - cachedTimestamp < DINING_CACHE_TTL_MS) {
    return;
  }

  diningRefreshInFlight[period] = (async () => {
    const previousMenu = diningMenuCache[period] ?? null;
    const previousTimestamp = diningRefreshTimestamps[period] ?? null;
    try {
      const nextMenu = await loadDiningMenuFirstItems(period);
      diningMenuCache[period] = nextMenu;
      diningRefreshTimestamps[period] = Date.now();
      if (typeof chrome !== 'undefined') {
        chrome.runtime.sendMessage(
          {
            type: 'diningMenuUpdated',
            payload: nextMenu
          },
          () => {
            const error = chrome.runtime.lastError;
            if (error) {
              console.debug('[background] diningMenuUpdated sendMessage lastError', error.message);
            }
          }
        );
      }
    } catch (error) {
      if (error instanceof DiningMenuError) {
        console.warn('[background] Failed to refresh dining menu', {
          code: error.code,
          message: error.message
        });
      } else {
        console.warn('[background] Failed to refresh dining menu', error);
      }

      if (previousMenu && previousTimestamp) {
        diningMenuCache[period] = previousMenu;
        diningRefreshTimestamps[period] = previousTimestamp;
      } else {
        throw error;
      }
    } finally {
      delete diningRefreshInFlight[period];
    }
  })();

  await diningRefreshInFlight[period];
}

function shouldForceDiningRefreshToday(period: DiningPeriod): boolean {
  const todayKey = getTodayKey();
  if (lastForcedDiningRefreshDateByPeriod[period] === todayKey) {
    return false;
  }
  // Mark once per day per period to cap forced-refresh traffic.
  lastForcedDiningRefreshDateByPeriod[period] = todayKey;
  return true;
}

function ensureRefreshAlarm(): void {
  chrome.alarms.get(REFRESH_ALARM, (alarm) => {
    if (!alarm) {
      if (isWithinSchoolHours()) {
        // Within school hours, create periodic alarm
        chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: REFRESH_INTERVAL_MINUTES });
        console.info('[background] Created refresh alarm (within school hours)');
      } else {
        // Outside school hours, schedule alarm for next 6am
        const nextStart = getNextSchoolHoursStart();
        chrome.alarms.create(REFRESH_ALARM, { when: nextStart.getTime() });
        console.info('[background] Scheduled refresh alarm for next school hours start', nextStart);
      }
    } else {
      // Check if we're outside school hours and alarm is still periodic
      if (!isWithinSchoolHours() && alarm.periodInMinutes) {
        // Clear periodic alarm and schedule for next school hours
        chrome.alarms.clear(REFRESH_ALARM, () => {
          const nextStart = getNextSchoolHoursStart();
          chrome.alarms.create(REFRESH_ALARM, { when: nextStart.getTime() });
          console.info('[background] Cleared periodic alarm, scheduled for next school hours start', nextStart);
        });
      } else if (isWithinSchoolHours() && !alarm.periodInMinutes) {
        // We're in school hours but alarm is one-time, switch to periodic
        chrome.alarms.clear(REFRESH_ALARM, () => {
          chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: REFRESH_INTERVAL_MINUTES });
          console.info('[background] Switched to periodic alarm (entered school hours)');
        });
      }
    }
  });
}

function isAlarmMinuteAligned(alarm: chrome.alarms.Alarm): boolean {
  const remainder = alarm.scheduledTime % 60000;
  const offset = remainder === 0 ? 0 : Math.min(remainder, 60000 - remainder);
  return offset <= 250;
}

function scheduleAlignedIconAlarm(): void {
  const now = Date.now();
  const nextMinuteStart = Math.ceil((now + 1) / 60000) * 60000;
  chrome.alarms.create(ICON_TICK_ALARM, {
    when: nextMinuteStart + 150,
    periodInMinutes: ICON_TICK_INTERVAL_MINUTES
  });
}

function ensureIconAlarm(): void {
  chrome.alarms.get(ICON_TICK_ALARM, (alarm) => {
    if (!alarm) {
      scheduleAlignedIconAlarm();
      return;
    }
    if (!isAlarmMinuteAligned(alarm)) {
      chrome.alarms.clear(ICON_TICK_ALARM, () => scheduleAlignedIconAlarm());
    }
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  ensureRefreshAlarm();
  ensureIconAlarm();
  await refreshSchedule(true); // 强制刷新，优先从网络加载
});

chrome.runtime.onStartup.addListener(async () => {
  ensureRefreshAlarm();
  ensureIconAlarm();
  await refreshSchedule(true); // 强制刷新，优先从网络加载
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === REFRESH_ALARM) {
    if (isWithinSchoolHours()) {
      // Within school hours, refresh and ensure periodic alarm continues
      await refreshSchedule(true); // 强制刷新，优先从网络加载
      ensureRefreshAlarm(); // Re-ensure alarm is periodic
    } else {
      // Outside school hours, don't refresh but schedule for next school hours
      console.info('[background] Refresh alarm triggered outside school hours, scheduling for next 6am');
      ensureRefreshAlarm(); // This will schedule for next 6am
    }
    return;
  }
  if (alarm.name === ICON_TICK_ALARM) {
    await updateActionIcon();
    return;
  }
  if (alarm.name === ICON_PRECISE_ALARM) {
    console.debug('[background] Precise icon update triggered');
    await updateActionIcon();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'getScheduleCache') {
    if (cachedTimestamp) {
      const cacheAge = Date.now() - cachedTimestamp;
      const cacheAgeMinutes = Math.round(cacheAge / 60000);
      console.info('[background] Returning cached schedule', {
        dateKey: cachedDateKey,
        blockCount: cachedSchedule.length,
        dayType: cachedDayType,
        cacheTimestamp: new Date(cachedTimestamp).toISOString(),
        cacheAgeMinutes: cacheAgeMinutes
      });
    } else {
      console.info('[background] Returning cached schedule (no timestamp)', {
        dateKey: cachedDateKey,
        blockCount: cachedSchedule.length,
        dayType: cachedDayType
      });
    }
    sendResponse({
      dateKey: cachedDateKey,
      blocks: cachedSchedule,
      dayType: cachedDayType,
      details: cachedDetails,
      networkFailed: cachedNetworkFailed
    });
    return true;
  }
  if (message?.type === 'preferencesUpdated') {
    refreshSchedule(true).finally(() => sendResponse({ ok: true })); // 强制刷新，优先从网络加载
    return true;
  }
  if (message?.type === 'requestScheduleRefresh') {
    // Always allow manual refresh from popup, regardless of time
    // Popup 打开时强制刷新，优先从网络加载，失败时使用缓存
    refreshSchedule(true)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        console.error('[background] Forced refresh failed', error);
        sendResponse({ ok: false, error: (error as Error)?.message ?? 'refresh_failed' });
      });
    return true;
  }
  if (message?.type === 'getDiningMenuCache') {
    const period = ((message?.period as DiningPeriod | undefined) ?? 'Lunch');
    sendResponse(diningMenuCache[period] ?? null);
    return true;
  }
  if (message?.type === 'requestDiningMenuRefresh') {
    const period = ((message?.period as DiningPeriod | undefined) ?? 'Lunch');
    const forceRefresh = shouldForceDiningRefreshToday(period);
    refreshDiningMenu(period, forceRefresh)
      .then(() => sendResponse({ ok: true, payload: diningMenuCache[period] ?? null }))
      .catch((error) => {
        console.error('[background] Dining menu refresh failed', error);
        sendResponse({
          ok: false,
          error: (error as Error)?.message ?? 'dining_refresh_failed',
          payload: diningMenuCache[period] ?? null
        });
      });
    return true;
  }
  return false;
});

// Listen for schedule preferences changes (e.g., time format)
if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.schedulePreferences) {
      const newPrefs = changes.schedulePreferences.newValue;
      if (newPrefs?.timeFormat && newPrefs.timeFormat !== cachedTimeFormat) {
        cachedTimeFormat = newPrefs.timeFormat;
        console.info('[background] Time format updated to', cachedTimeFormat);
        updateActionIcon().catch((error) => {
          console.debug('[background] Failed to update icon after time format change', error);
        });
      }
    }
  });
}

// Initial kick-off when the service worker spins up.
refreshSchedule(true).catch((error) => { // 强制刷新，优先从网络加载
  console.error('[background] Initial refresh failed', error);
});
ensureRefreshAlarm();
ensureIconAlarm();
updateActionIcon().catch((error) => {
  console.debug('[background] Initial icon update failed', error);
});
