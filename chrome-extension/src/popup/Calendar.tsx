import React, { useEffect, useMemo, useRef, useState } from 'react';
import AnimatedCollapse from './AnimatedCollapse';
import { useRevealExpandedSection } from './useRevealExpandedSection';
import { DateTime } from 'luxon';
import { Block, EST_ZONE, GradeLevel, parseBlockTime, toDisplayTime } from '../types/schedule';
import { BlockPreferenceRecord, resolveBlockDisplay } from '../storage/blockPreferences';
import {
  fetchCalendarEvents,
  loadCachedCalendarEvents,
  saveCachedCalendarEvents,
  type CalendarEvent
} from '../services/calendarService';
import {
  fetchDayTypes,
  loadCachedDayTypes,
  saveCachedDayTypes,
  type DayTypeMap,
  type PublishedDayType
} from '../services/dayTypeService';
import {
  fetchSpecialDays,
  fetchSpecialPeriodsList,
  loadBlocksForDate,
  type ScheduleResult,
  type SpecialDayRecord,
  type SpecialPeriod
} from '../services/scheduleService';

/**
 * A month of the school calendar. Each day's background says what kind of day
 * it is (Green, White, or no school) and a single mark says whether anything
 * is on: a star when the bell schedule is not the usual one, otherwise a
 * circle when there is an event. Tapping a day lists its events and, behind
 * one more tap, that day's blocks.
 */

type DayColor = 'green' | 'white' | 'no-school' | null;
type DayMarker = 'star' | 'circle' | null;

interface DayInfo {
  key: string;
  color: DayColor;
  marker: DayMarker;
  noSchool: boolean;
  /** Exactly one of the three day types, or null when the file does not say. */
  label: PublishedDayType | null;
  /** "Winter Break", "Late start" — stands in for the event list when it is empty. */
  note: string | null;
  events: CalendarEvent[];
}

interface TodaySchedule {
  dateKey: string;
  blocks: Block[];
  dayType: string | null;
}

interface CalendarProps {
  now: Date;
  timeFormat: '12h' | '24h';
  blockPrefs: BlockPreferenceRecord;
  viewingGrade: GradeLevel | null;
  today: TodaySchedule;
  calendarUrl: string;
}

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function toKey(day: DateTime): string {
  return day.toFormat('yyyy-LL-dd');
}

function fromKey(key: string): DateTime {
  return DateTime.fromFormat(key, 'yyyy-LL-dd', { zone: EST_ZONE }).startOf('day');
}

function compareEvents(a: CalendarEvent, b: CalendarEvent): number {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  if (a.startTime !== b.startTime) return (a.startTime ?? '') < (b.startTime ?? '') ? -1 : 1;
  return a.title.localeCompare(b.title);
}

function formatClock(hhmm: string, format: '12h' | '24h'): string {
  const dt = DateTime.fromFormat(hhmm, 'HH:mm');
  if (!dt.isValid) return hhmm;
  return format === '24h' ? dt.toFormat('HH:mm') : dt.toFormat('h:mm a').toLowerCase();
}

function humanizeType(type: string): string {
  if (type === 'late_start') return 'Late start';
  if (type === 'abdec') return 'ABDEC';
  return type.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Follows the same rules as data/scripts/fetch_day_type.mjs for what counts
 * as a school day, so a blank day here agrees with the "No School" that file
 * publishes — and still answers for months the file does not reach.
 */
function isDayOff(
  key: string,
  dayTypes: DayTypeMap,
  specialDays: Record<string, SpecialDayRecord>,
  periods: SpecialPeriod[]
): boolean {
  const special = specialDays[key];
  if (special?.type) return special.type === 'no_school';
  const weekday = fromKey(key).weekday; // 1 = Monday … 7 = Sunday
  return periods.some((p) => key >= p.start && key <= p.end)
    || weekday === 6
    || weekday === 7
    || dayTypes[key] === 'No School';
}

function describeDay(
  key: string,
  events: CalendarEvent[],
  dayTypes: DayTypeMap,
  specialDays: Record<string, SpecialDayRecord>,
  periods: SpecialPeriod[]
): DayInfo {
  const special = specialDays[key];
  const period = periods.find((p) => key >= p.start && key <= p.end) ?? null;
  const noSchool = isDayOff(key, dayTypes, specialDays, periods);

  const dayEvents = events.filter((e) => e.start <= key && key <= e.end).sort(compareEvents);
  const hasScheduleEvent = dayEvents.some((e) => e.kind === 'schedule');
  const hasOtherEvent = dayEvents.some((e) => e.kind !== 'schedule');
  const specialSchedule = !noSchool && (Boolean(special?.type) || hasScheduleEvent);

  const label: PublishedDayType | null = noSchool ? 'No School' : dayTypes[key] ?? null;

  let color: DayColor = null;
  if (noSchool) color = 'no-school';
  else if (label === 'Green Day') color = 'green';
  else if (label === 'White Day') color = 'white';

  // Holidays and late starts are nearly always events too, so this only has
  // to carry the days the calendar feed says nothing about.
  let note = special?.details ?? period?.details ?? null;
  if (!note && !noSchool && special?.type) {
    note = special.type === 'custom' ? 'Special schedule' : humanizeType(special.type);
  }

  return {
    key,
    color,
    marker: specialSchedule ? 'star' : hasOtherEvent ? 'circle' : null,
    noSchool,
    label,
    note,
    events: dayEvents
  };
}

const StarMark: React.FC = () => (
  <svg className="cal-mark" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2.5l2.9 6.2 6.7.8-5 4.6 1.3 6.7L12 17.5l-5.9 3.3 1.3-6.7-5-4.6 6.7-.8z" fill="currentColor" />
  </svg>
);

const CircleMark: React.FC = () => (
  <svg className="cal-mark" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="3.5" />
  </svg>
);

const Calendar: React.FC<CalendarProps> = ({ now, timeFormat, blockPrefs, viewingGrade, today, calendarUrl }) => {
  const todayKey = useMemo(() => toKey(DateTime.fromJSDate(now, { zone: EST_ZONE })), [now]);

  const [month, setMonth] = useState<DateTime>(() => fromKey(todayKey).startOf('month'));
  const [selectedKey, setSelectedKey] = useState<string>(todayKey);
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [dayTypes, setDayTypes] = useState<DayTypeMap>({});
  const [specialDays, setSpecialDays] = useState<Record<string, SpecialDayRecord>>({});
  const [periods, setPeriods] = useState<SpecialPeriod[]>([]);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const scheduleSection = useRevealExpandedSection<HTMLDivElement>(scheduleOpen, undefined, '.calendar-content');
  const [daySchedule, setDaySchedule] = useState<{ key: string; result: ScheduleResult } | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const scheduleCache = useRef(new Map<string, ScheduleResult>());

  useEffect(() => {
    let cancelled = false;

    loadCachedCalendarEvents()
      .then((cached) => {
        if (!cancelled && cached && cached.length > 0) setEvents((prev) => prev ?? cached);
      })
      .catch(() => {});
    fetchCalendarEvents()
      .then((fresh) => {
        if (cancelled) return;
        setEvents(fresh);
        setEventsError(null);
        return saveCachedCalendarEvents(fresh);
      })
      .catch((err) => {
        console.warn('[calendar] Failed to load events', err);
        if (!cancelled) {
          setEvents((prev) => prev ?? []);
          setEventsError('Calendar unavailable');
        }
      });

    loadCachedDayTypes()
      .then((cached) => {
        if (!cancelled && cached) setDayTypes((prev) => (Object.keys(prev).length ? prev : cached));
      })
      .catch(() => {});
    fetchDayTypes()
      .then((fresh) => {
        if (cancelled) return;
        setDayTypes(fresh);
        return saveCachedDayTypes(fresh);
      })
      .catch((err) => console.warn('[calendar] Failed to load day types', err));

    fetchSpecialDays()
      .then((days) => {
        if (!cancelled && days) setSpecialDays(days);
      })
      .catch(() => {});
    fetchSpecialPeriodsList()
      .then((list) => {
        if (!cancelled && list) setPeriods(list);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  // The grid is six rows at most; only as many as the month needs are drawn.
  const cells = useMemo(() => {
    const monthStart = month.startOf('month');
    const lead = monthStart.weekday % 7; // Sunday-first
    const total = Math.ceil((lead + (monthStart.daysInMonth ?? 30)) / 7) * 7;
    const first = monthStart.minus({ days: lead });
    return Array.from({ length: total }, (_, i) => {
      const day = first.plus({ days: i });
      return { key: toKey(day), day: day.day, inMonth: day.month === month.month };
    });
  }, [month]);

  const infoByKey = useMemo(() => {
    const map = new Map<string, DayInfo>();
    for (const cell of cells) {
      if (cell.inMonth) {
        map.set(cell.key, describeDay(cell.key, events ?? [], dayTypes, specialDays, periods));
      }
    }
    return map;
  }, [cells, events, dayTypes, specialDays, periods]);

  const selected = infoByKey.get(selectedKey) ?? null;

  // The 1st is often a Saturday or still inside a break, and a blank day has
  // nothing to show, so land on the month's first day of school instead.
  const firstSchoolDay = (target: DateTime): string => {
    const start = target.startOf('month');
    for (let i = 0; i < (start.daysInMonth ?? 31); i += 1) {
      const key = toKey(start.plus({ days: i }));
      if (!isDayOff(key, dayTypes, specialDays, periods)) return key;
    }
    return toKey(start); // A month entirely off, like July.
  };

  const stepMonth = (delta: number) => {
    const next = month.plus({ months: delta });
    setMonth(next);
    setSelectedKey(next.hasSame(fromKey(todayKey), 'month') ? todayKey : firstSchoolDay(next));
    setScheduleOpen(false);
  };

  // Tapping the selected day again keeps it selected: there is no state of the
  // calendar where nothing is picked.
  const pickDay = (key: string) => {
    setSelectedKey(key);
    setScheduleOpen(false);
  };

  // Blocks are fetched only when the row is opened: loadBlocksForDate goes to
  // the network and a month of days should not cost a month of requests.
  useEffect(() => {
    if (!scheduleOpen || !selected || selected.noSchool) {
      return () => {};
    }
    const key = selectedKey;
    if (key === today.dateKey) {
      setDaySchedule({ key, result: { blocks: today.blocks, dayType: today.dayType } });
      return () => {};
    }
    const cached = scheduleCache.current.get(key);
    if (cached) {
      setDaySchedule({ key, result: cached });
      return () => {};
    }

    let cancelled = false;
    setScheduleLoading(true);
    loadBlocksForDate(fromKey(key).toJSDate())
      .then((result) => {
        if (cancelled) return;
        scheduleCache.current.set(key, result);
        setDaySchedule({ key, result });
      })
      .catch((err) => {
        console.warn('[calendar] Failed to load schedule for', key, err);
        if (!cancelled) setDaySchedule({ key, result: { blocks: [], dayType: null, networkFailed: true } });
      })
      .finally(() => {
        if (!cancelled) setScheduleLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scheduleOpen, selectedKey, selected?.noSchool, today.dateKey, today.blocks, today.dayType]);

  const shownSchedule = daySchedule && daySchedule.key === selectedKey ? daySchedule.result : null;
  const shownBlocks = useMemo(() => {
    if (!shownSchedule) return [];
    const hasGrades = shownSchedule.blocks.some((b) => b.grades && b.grades.length > 0);
    if (!hasGrades || viewingGrade == null) return shownSchedule.blocks;
    return shownSchedule.blocks.filter((b) => !b.grades || b.grades.includes(viewingGrade));
  }, [shownSchedule, viewingGrade]);

  const selectedDate = fromKey(selectedKey);
  const scheduleDayType = shownSchedule?.dayType ?? dayTypes[selectedKey] ?? null;

  return (
    <div className="calendar-content">
      <div className="cal-header">
        <button type="button" className="menu-day-step" onClick={() => stepMonth(-1)} aria-label="Previous month">
          <span className="chevron chevron-prev" aria-hidden="true" />
        </button>
        <span className="cal-month">{month.toFormat('LLLL yyyy')}</span>
        <button type="button" className="menu-day-step" onClick={() => stepMonth(1)} aria-label="Next month">
          <span className="chevron chevron-next" aria-hidden="true" />
        </button>
      </div>
      <div className="cal-grid" role="grid">
        {WEEKDAY_LETTERS.map((letter, i) => (
          <span key={`wd-${i}`} className="cal-weekday" aria-hidden="true">{letter}</span>
        ))}
        {cells.map((cell) => {
          if (!cell.inMonth) {
            // Left blank: an off day in this month is already drawn as an
            // empty cell, and a neighbouring month's dates would read as more
            // of those rather than as another month.
            return <span key={cell.key} className="cal-day cal-day-outside" aria-hidden="true" />;
          }
          const info = infoByKey.get(cell.key);
          const classes = ['cal-day'];
          if (info?.color) classes.push(`cal-${info.color}`);
          if (cell.key === todayKey) classes.push('cal-today');
          if (cell.key === selectedKey) classes.push('cal-selected');
          return (
            <button
              key={cell.key}
              type="button"
              className={classes.join(' ')}
              onClick={() => pickDay(cell.key)}
              aria-pressed={cell.key === selectedKey}
              aria-label={fromKey(cell.key).toFormat('cccc, LLLL d')}
            >
              <span className="cal-day-number">{cell.day}</span>
              {info?.marker === 'star' ? <StarMark /> : info?.marker === 'circle' ? <CircleMark /> : <span className="cal-mark" />}
            </button>
          );
        })}
      </div>

      {selected ? (
        <div className="cal-day-panel">
          <p className="cal-day-title">
            <span>{selectedDate.toFormat('ccc, LLL d')}</span>
            {selected.label ? <span className="cal-day-status">{selected.label}</span> : null}
          </p>
          {events === null ? (
            <p className="events-empty">Loading…</p>
          ) : selected.events.length === 0 ? (
            <p className="events-empty">{eventsError ?? selected.note ?? 'Nothing on this day'}</p>
          ) : (
            <ul className="cal-events">
              {selected.events.map((event) => {
                const when = event.allDay
                  ? null
                  : event.endTime
                    ? `${formatClock(event.startTime ?? '', timeFormat)} – ${formatClock(event.endTime, timeFormat)}`
                    : formatClock(event.startTime ?? '', timeFormat);
                const body = (
                  <>
                    <span className="cal-event-title">{event.title}</span>
                    {when ? <span className="cal-event-time">{when}</span> : null}
                  </>
                );
                return (
                  <li key={event.id} className="cal-event">
                    {event.url ? (
                      <a href={event.url} target="_blank" rel="noreferrer noopener" title="Open on the school website">
                        {body}
                      </a>
                    ) : (
                      <div>{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {!selected.noSchool ? (
            <div className="cal-schedule" ref={scheduleSection}>
              <button
                type="button"
                className="cal-schedule-toggle"
                aria-expanded={scheduleOpen}
                onClick={() => setScheduleOpen((prev) => !prev)}
              >
                <span>Schedule</span>
                <span className={`chevron ${scheduleOpen ? 'open' : ''}`} aria-hidden="true" />
              </button>
              <AnimatedCollapse expanded={scheduleOpen}>
              {scheduleLoading || !shownSchedule ? (
                  <p className="events-empty">Loading…</p>
                ) : shownSchedule.networkFailed ? (
                  <p className="events-empty">Schedule unavailable</p>
                ) : shownBlocks.length === 0 ? (
                  <p className="events-empty">{shownSchedule.details ?? 'No blocks'}</p>
                ) : (
                  <ul className="cal-blocks">
                    {shownBlocks.map((block) => {
                      const base = selectedDate.toJSDate();
                      const display = resolveBlockDisplay(block.name, scheduleDayType, blockPrefs);
                      const muted = display.isFree || display.useGrayText;
                      return (
                        <li key={block.id} className={muted ? 'muted-block' : undefined}>
                          <span className="cal-block-name">{display.label}</span>
                          <span className="cal-block-time">
                            {toDisplayTime(parseBlockTime(block.start, base), timeFormat)} – {toDisplayTime(parseBlockTime(block.end, base), timeFormat)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </AnimatedCollapse>
            </div>
          ) : null}
        </div>
      ) : null}

      <p className="events-meta">
        <a className="dining-link" href={calendarUrl} target="_blank" rel="noreferrer noopener">
          <svg className="dining-link-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M14 4h6v6m0-6-8 8M10 6H7a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>SJA Calendar</span>
        </a>
      </p>
    </div>
  );
};

export default Calendar;
