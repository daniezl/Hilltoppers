import React, { useEffect, useMemo, useState } from 'react';
import {
  buildWeek,
  fetchCalendarEvents,
  formatEventTime,
  formatShortDate,
  loadCachedCalendarEvents,
  pickDefaultTarget,
  relativeLabel,
  saveCachedCalendarEvents,
  targetForWeekDay,
  type BubbleTarget,
  type CalendarEvent,
  type WeekDay
} from '../services/calendarService';

interface CalendarStripProps {
  now: Date;
  /** True once the last block of the day has ended (or on a day with no blocks). */
  schoolDayOver: boolean;
  timeFormat: '12h' | '24h';
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MAX_BUBBLE_ROWS = 3;

function dayAriaLabel(day: WeekDay): string {
  const name = WEEKDAY_NAMES[day.weekday];
  if (day.events.length === 0) return name;
  const titles = day.events.map((e) => e.title).join('; ');
  return `${name}: ${titles}`;
}

function openEvent(event: CalendarEvent) {
  if (!event.url) return;
  if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
    chrome.tabs.create({ url: event.url });
  } else {
    window.open(event.url, '_blank', 'noopener');
  }
}

const CalendarStrip: React.FC<CalendarStripProps> = ({ now, schoolDayOver, timeFormat }) => {
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Render the cache first so the strip appears with the rest of the popup,
    // then swap in fresh data.
    (async () => {
      const cached = await loadCachedCalendarEvents();
      if (!cancelled && cached && cached.length > 0) {
        setEvents(cached);
      }
      try {
        const fresh = await fetchCalendarEvents();
        if (cancelled) return;
        setEvents(fresh);
        void saveCachedCalendarEvents(fresh);
      } catch (err) {
        console.warn('[calendar] Failed to load events.json', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // The default target only moves at minute granularity; re-deriving it on every
  // one-second tick of `now` would be wasted work.
  const minuteKey = Math.floor(now.getTime() / 60000);

  const week = useMemo(
    () => (events ? buildWeek(events, now) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, minuteKey]
  );

  const defaultTarget = useMemo(
    () => (events ? pickDefaultTarget(events, week, now, schoolDayOver) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, week, minuteKey, schoolDayOver]
  );

  if (!events || events.length === 0) {
    return null;
  }

  const target: BubbleTarget | null =
    hoverIndex !== null && week[hoverIndex] ? targetForWeekDay(week[hoverIndex], hoverIndex) : defaultTarget;

  const pointerIndex = target?.weekIndex ?? null;
  const beyondWeek = target !== null && pointerIndex === null;
  const label = target
    ? beyondWeek
      ? `${relativeLabel(target.dayKey, now)} · ${formatShortDate(target.dayKey)}`
      : relativeLabel(target.dayKey, now)
    : null;

  const visibleEvents = target ? target.events.slice(0, MAX_BUBBLE_ROWS) : [];
  const hiddenCount = target ? Math.max(0, target.events.length - MAX_BUBBLE_ROWS) : 0;

  const bubbleClasses = ['calendar-bubble'];
  if (target?.isToday) bubbleClasses.push('today');
  if (pointerIndex !== null) bubbleClasses.push('pointed');

  const bubble = (
    <div
      className={bubbleClasses.join(' ')}
      style={pointerIndex !== null ? ({ '--pointer-index': pointerIndex } as React.CSSProperties) : undefined}
    >
      {target ? (
        <>
          <span className="calendar-bubble-label">{label}</span>
          <ul className="calendar-bubble-list">
            {visibleEvents.map((event) => {
              const time = formatEventTime(event, timeFormat);
              return (
                <li key={event.id}>
                  <a
                    className="calendar-bubble-row"
                    href={event.url ?? undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      openEvent(event);
                    }}
                    title={event.description ? `${event.title}\n\n${event.description}` : event.title}
                  >
                    <span className="calendar-bubble-title">{event.title}</span>
                    {time ? <span className="calendar-bubble-time">{time}</span> : null}
                  </a>
                </li>
              );
            })}
            {hiddenCount > 0 ? (
              <li className="calendar-bubble-more">+{hiddenCount} more</li>
            ) : null}
          </ul>
        </>
      ) : (
        <span className="calendar-bubble-empty">Nothing coming up</span>
      )}
    </div>
  );

  // The bubble sits above the strip and points down at the day it describes.
  return (
    <section className="calendar-strip" aria-label="This week" onMouseLeave={() => setHoverIndex(null)}>
      {bubble}
      <div className="week-row" role="list">
        {week.map((day, index) => {
          const classes = ['week-day'];
          if (day.isToday) classes.push('today');
          if (day.isPast) classes.push('past');
          if (day.isWeekend) classes.push('weekend');
          if (day.hasEvents) classes.push('has-events');
          if (pointerIndex === index) classes.push('active');

          const interactive = day.hasEvents;
          const glyph = day.hasEvents ? '!' : day.letter;

          return (
            <div
              key={day.key}
              role="listitem"
              className={classes.join(' ')}
              aria-label={dayAriaLabel(day)}
              title={interactive ? undefined : WEEKDAY_NAMES[day.weekday]}
              tabIndex={interactive ? 0 : undefined}
              onMouseEnter={interactive ? () => setHoverIndex(index) : undefined}
              onFocus={interactive ? () => setHoverIndex(index) : undefined}
              onBlur={interactive ? () => setHoverIndex(null) : undefined}
            >
              <span className="week-day-glyph" aria-hidden="true">{glyph}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default CalendarStrip;
