import { DateTime } from 'luxon';
import { loadBlocksForDate } from '../services/scheduleService';
import { Block, EST_ZONE } from '../types/schedule';

const REFRESH_ALARM = 'schedule-refresh';
const REFRESH_INTERVAL_MINUTES = 5;

let cachedSchedule: Block[] = [];
let cachedDateKey = '';

function getTodayKey(): string {
  return DateTime.now().setZone(EST_ZONE).toFormat('yyyy-LL-dd');
}

async function refreshSchedule(): Promise<void> {
  try {
    const today = DateTime.now().setZone(EST_ZONE).startOf('day').toJSDate();
    const blocks = await loadBlocksForDate(today);
    cachedSchedule = blocks;
    cachedDateKey = getTodayKey();
    if (typeof chrome !== 'undefined') {
      chrome.runtime.sendMessage(
        {
          type: 'scheduleUpdated',
          payload: {
            dateKey: cachedDateKey,
            blocks
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
  }
}

function ensureAlarm(): void {
  chrome.alarms.get(REFRESH_ALARM, (alarm) => {
    if (!alarm) {
      chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: REFRESH_INTERVAL_MINUTES });
    }
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  ensureAlarm();
  await refreshSchedule();
});

chrome.runtime.onStartup.addListener(async () => {
  ensureAlarm();
  await refreshSchedule();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === REFRESH_ALARM) {
    await refreshSchedule();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'getScheduleCache') {
    sendResponse({
      dateKey: cachedDateKey,
      blocks: cachedSchedule
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
ensureAlarm();
