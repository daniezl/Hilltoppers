import { DateTime } from 'luxon';
import { EST_ZONE } from '../types/schedule';

/**
 * The school's public event calendar, as published to events.json by
 * data/scripts/fetch_sja_events.mjs. Rendered in the popup as a week strip.
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

export interface WeekDay {
  key: string;
  /** 0 = Sunday … 6 = Saturday, matching the school's own Sunday-first grid. */
  weekday: number;
  letter: string;
  isToday: boolean;
  /** True when this column had to wrap forward because its day this week is over. */
  isNextWeek: boolean;
  isWeekend: boolean;
  events: CalendarEvent[];
  hasEvents: boolean;
}

export interface BubbleTarget {
  dayKey: string;
  events: CalendarEvent[];
  /** Index into the week strip when the day is in view, else null (no pointer). */
  weekIndex: number | null;
  isToday: boolean;
}

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function schoolDay(now: Date): DateTime {
  return DateTime.fromJSDate(now, { zone: EST_ZONE }).startOf('day');
}

function toKey(day: DateTime): string {
  return day.toFormat('yyyy-LL-dd');
}

function fromKey(key: string): DateTime {
  return DateTime.fromFormat(key, 'yyyy-LL-dd', { zone: EST_ZONE }).startOf('day');
}

function compareEvents(a: CalendarEvent, b: CalendarEvent): number {
  // All-day first, then by clock time, then by title so the order is stable.
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  if (a.startTime !== b.startTime) return (a.startTime ?? '') < (b.startTime ?? '') ? -1 : 1;
  return a.title.localeCompare(b.title);
}

export function eventsOn(events: CalendarEvent[], dayKey: string): CalendarEvent[] {
  return events.filter((e) => e.start <= dayKey && dayKey <= e.end).sort(compareEvents);
}

/**
 * Seven Sunday-first columns, each showing the next occurrence of its weekday.
 * Columns whose day this week is already over wrap forward to next week, so the
 * strip always covers today plus the six days after it while keeping Sunday on
 * the left. On a Thursday that reads: next Sun/Mon/Tue/Wed, then Thu/Fri/Sat.
 */
export function buildWeek(events: CalendarEvent[], now: Date): WeekDay[] {
  const today = schoolDay(now);
  // Luxon weekdays run Monday=1 … Sunday=7; the strip starts on Sunday.
  const todayColumn = today.weekday % 7;
  const weekStart = today.minus({ days: todayColumn });

  return DAY_LETTERS.map((letter, index) => {
    const isNextWeek = index < todayColumn;
    const day = weekStart.plus({ days: index + (isNextWeek ? 7 : 0) });
    const key = toKey(day);
    const dayEvents = eventsOn(events, key);
    return {
      key,
      weekday: index,
      letter,
      isToday: index === todayColumn,
      isNextWeek,
      isWeekend: index === 0 || index === 6,
      events: dayEvents,
      hasEvents: dayEvents.length > 0
    };
  });
}

/** How many leading columns wrapped to next week — also today's column index. */
export function wrappedColumnCount(week: WeekDay[]): number {
  return week.filter((d) => d.isNextWeek).length;
}

/**
 * What the bubble shows when nothing is hovered: today whenever today has
 * anything on it — even if it already happened — otherwise the next day that
 * has anything on it.
 */
export function pickDefaultTarget(
  events: CalendarEvent[],
  week: WeekDay[],
  now: Date
): BubbleTarget | null {
  const todayKey = toKey(schoolDay(now));
  const todayEvents = eventsOn(events, todayKey);

  if (todayEvents.length > 0) {
    return {
      dayKey: todayKey,
      events: todayEvents,
      weekIndex: week.findIndex((d) => d.key === todayKey),
      isToday: true
    };
  }

  const tomorrowKey = toKey(schoolDay(now).plus({ days: 1 }));
  let nextKey: string | null = null;
  for (const event of events) {
    if (event.end < tomorrowKey) continue;
    const firstVisibleDay = event.start > tomorrowKey ? event.start : tomorrowKey;
    if (nextKey === null || firstVisibleDay < nextKey) nextKey = firstVisibleDay;
  }
  if (nextKey === null) return null;

  const index = week.findIndex((d) => d.key === nextKey);
  return {
    dayKey: nextKey,
    events: eventsOn(events, nextKey),
    weekIndex: index === -1 ? null : index,
    isToday: false
  };
}

export function targetForWeekDay(day: WeekDay, index: number): BubbleTarget {
  return { dayKey: day.key, events: day.events, weekIndex: index, isToday: day.isToday };
}

/**
 * "Today", "Tomorrow", then the weekday name for the rest of this Sunday-first
 * week and "Next Monday" for the week after — the same split the strip's
 * NEXT WEEK / THIS WEEK captions draw. Further out falls back to a day count.
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

/** "Sep 7" — the weekday is already in the relative label. */
export function formatMonthDay(dayKey: string): string {
  return fromKey(dayKey).toFormat('MMM d');
}

export function formatEventTime(event: CalendarEvent, format: '12h' | '24h'): string | null {
  if (!event.startTime) return null;
  const [hour, minute] = event.startTime.split(':').map(Number);
  const time = DateTime.fromObject({ hour, minute }, { zone: EST_ZONE });
  return format === '24h' ? time.toFormat('HH:mm') : time.toFormat('h:mm a');
}
