import { DateTime } from 'luxon';
import { EST_ZONE } from '../types/schedule';

/**
 * The school's public event calendar, as published to events.json by
 * data/scripts/fetch_sja_events.mjs. The popup's Calendar section marks the
 * days these fall on and links out to the school's own calendar for the rest.
 */

export type CalendarEventKind = 'schedule' | 'break' | 'event';

export interface CalendarEvent {
  id: string;
  title: string;
  /** First day, YYYY-MM-DD, inclusive. */
  start: string;
  /** Last day, YYYY-MM-DD, inclusive. */
  end: string;
  allDay: boolean;
  /** HH:MM in school-local time, or null for all-day events. */
  startTime: string | null;
  endTime: string | null;
  kind: CalendarEventKind;
  description: string;
  url: string | null;
}

interface RawEventsJson {
  source?: unknown;
  sourceUpdatedAt?: unknown;
  events?: unknown;
}

const CLOUDFLARE_BASE_URL = import.meta.env.VITE_CLOUDFLARE_SCHEDULE_URL || 'https://hilltoppers.pages.dev';
const EVENTS_JSON_URL = `${CLOUDFLARE_BASE_URL}/events.json`;
const CACHE_KEY = 'calendarEventsCache';

const KINDS: ReadonlySet<string> = new Set(['schedule', 'break', 'event']);
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^\d{2}:\d{2}$/;

function normalizeEvent(value: unknown): CalendarEvent | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const start = typeof raw.start === 'string' && YMD.test(raw.start) ? raw.start : null;
  if (!title || !start) return null;

  const end = typeof raw.end === 'string' && YMD.test(raw.end) && raw.end >= start ? raw.end : start;
  const startTime = typeof raw.startTime === 'string' && HHMM.test(raw.startTime) ? raw.startTime : null;
  const endTime = typeof raw.endTime === 'string' && HHMM.test(raw.endTime) ? raw.endTime : null;

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `${start}:${title}`,
    title,
    start,
    end,
    allDay: raw.allDay === true || startTime === null,
    startTime,
    endTime,
    kind: typeof raw.kind === 'string' && KINDS.has(raw.kind) ? (raw.kind as CalendarEventKind) : 'event',
    description: typeof raw.description === 'string' ? raw.description : '',
    url: typeof raw.url === 'string' && raw.url ? raw.url : null
  };
}

export async function fetchCalendarEvents(): Promise<CalendarEvent[]> {
  const response = await fetch(EVENTS_JSON_URL, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`events.json returned HTTP ${response.status}`);
  }
  const data = (await response.json()) as RawEventsJson;
  if (!Array.isArray(data.events)) {
    throw new Error('events.json is missing the events array');
  }
  return data.events.map(normalizeEvent).filter((e): e is CalendarEvent => e !== null);
}

export async function loadCachedCalendarEvents(): Promise<CalendarEvent[] | null> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return null;
  }
  try {
    const stored = await chrome.storage.local.get(CACHE_KEY);
    const cached = stored?.[CACHE_KEY] as { events?: unknown } | undefined;
    if (!Array.isArray(cached?.events)) return null;
    return cached.events.map(normalizeEvent).filter((e): e is CalendarEvent => e !== null);
  } catch {
    return null;
  }
}

export async function saveCachedCalendarEvents(events: CalendarEvent[]): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return;
  }
  try {
    await chrome.storage.local.set({ [CACHE_KEY]: { events, cachedAt: Date.now() } });
  } catch {
    // A full cache is not worth failing the render over.
  }
}

// ---------------------------------------------------------------------------
// Pure date logic. Everything below is deterministic given `now`, so it can be
// exercised without a browser.
// ---------------------------------------------------------------------------

function schoolDay(now: Date): DateTime {
  return DateTime.fromJSDate(now, { zone: EST_ZONE }).startOf('day');
}

function fromKey(key: string): DateTime {
  return DateTime.fromFormat(key, 'yyyy-LL-dd', { zone: EST_ZONE }).startOf('day');
}

/**
 * "Today", "Tomorrow", then the weekday name for the rest of this Sunday-first
 * week and "Next Monday" for the week after. Further out falls back to a day
 * count, which stays easier to read than a bare date.
 */
export function relativeLabel(dayKey: string, now: Date): string {
  const today = schoolDay(now);
  const day = fromKey(dayKey);
  const diff = Math.round(day.diff(today, 'days').days);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff < 0) return `${-diff} days ago`;

  const weeksAhead = Math.floor((diff + (today.weekday % 7)) / 7);
  const name = day.toFormat('cccc');
  if (weeksAhead === 0) return name;
  if (weeksAhead === 1) return `Next ${name}`;
  return `In ${diff} days`;
}

