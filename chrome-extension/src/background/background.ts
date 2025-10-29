
import { DateTime } from 'luxon';
import { loadBlocksForDate } from '../services/scheduleService';
import { Block, EST_ZONE, parseBlockTime } from '../types/schedule';

type CountdownKind = 'current' | 'upcoming' | 'idle' | 'none';

const REFRESH_ALARM = 'schedule-refresh';
const REFRESH_INTERVAL_MINUTES = 5;
const ICON_TICK_ALARM = 'schedule-icon-tick';
const ICON_TICK_INTERVAL_MINUTES = 1;

let cachedSchedule: Block[] = [];
let cachedDateKey = '';
let cachedDayType: string | null = null;

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
      const endDisplay = DateTime.fromJSDate(end, { zone: EST_ZONE }).toFormat('h:mm a');
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
      const startDisplay = DateTime.fromJSDate(start, { zone: EST_ZONE }).toFormat('h:mm a');
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

function createIconImageData(label: string, kind: CountdownKind): Partial<Record<'16' | '32' | '48', ImageData>> | null {
  if (typeof OffscreenCanvas === 'undefined') {
    console.debug('[background] OffscreenCanvas unavailable; skipping icon render');
    return null;
  }

  const isUpcoming = kind === 'upcoming';
  const background = isUpcoming ? '#ffffff' : '#213e26';
  const textColor = isUpcoming ? '#1f6f2b' : '#ffffff';
  const sizes = [16, 32, 48];
  const imageData: Partial<Record<'16' | '32' | '48', ImageData>> = {};

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

    const key = String(size) as '16' | '32' | '48';
    imageData[key] = ctx.getImageData(0, 0, size, size);
  }

  return Object.keys(imageData).length ? imageData : null;
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
          16: 'icons/icon16.png',
          32: 'icons/icon32.png',
          48: 'icons/icon48.png',
          128: 'icons/icon128.png'
        }});
      }
    } else {
      await chrome.action.setIcon({ path: {
        16: 'icons/icon16.png',
        32: 'icons/icon32.png',
        48: 'icons/icon48.png',
        128: 'icons/icon128.png'
      }});
    }
    await chrome.action.setTitle({ title: tooltip });
  } catch (error) {
    console.debug('[background] Failed to update action icon', error);
  }
}

async function refreshSchedule(): Promise<void> {
  try {
    const today = DateTime.now().setZone(EST_ZONE).startOf('day').toJSDate();
    const { blocks, dayType } = await loadBlocksForDate(today);
    cachedSchedule = blocks;
    cachedDateKey = getTodayKey();
    cachedDayType = dayType ?? null;
    if (typeof chrome !== 'undefined') {
      chrome.runtime.sendMessage(
        {
          type: 'scheduleUpdated',
          payload: {
            dateKey: cachedDateKey,
            blocks,
            dayType: cachedDayType
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
  } finally {
    await updateActionIcon();
  }
}

function ensureRefreshAlarm(): void {
  chrome.alarms.get(REFRESH_ALARM, (alarm) => {
    if (!alarm) {
      chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: REFRESH_INTERVAL_MINUTES });
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
  await refreshSchedule();
});

chrome.runtime.onStartup.addListener(async () => {
  ensureRefreshAlarm();
  ensureIconAlarm();
  await refreshSchedule();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === REFRESH_ALARM) {
    await refreshSchedule();
    return;
  }
  if (alarm.name === ICON_TICK_ALARM) {
    await updateActionIcon();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'getScheduleCache') {
    sendResponse({
      dateKey: cachedDateKey,
      blocks: cachedSchedule,
      dayType: cachedDayType
    });
    return true;
  }
  if (message?.type === 'preferencesUpdated') {
    refreshSchedule().finally(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

// Initial kick-off when the service worker spins up.
refreshSchedule().catch((error) => {
  console.error('[background] Initial refresh failed', error);
});
ensureRefreshAlarm();
ensureIconAlarm();
updateActionIcon().catch((error) => {
  console.debug('[background] Initial icon update failed', error);
});
