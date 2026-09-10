import React, { useEffect, useMemo, useState } from 'react';
import {
  buildWeek,
  fetchCalendarEvents,
  formatEventTime,
  formatMonthDay,
  loadCachedCalendarEvents,
  pickDefaultTarget,
  relativeLabel,
  saveCachedCalendarEvents,
  targetForWeekDay,
  wrappedColumnCount,
  type BubbleTarget,
  type CalendarEvent,
  type WeekDay
} from '../services/calendarService';
import { predictDayTypeRange } from '../services/dayTypePredictor';

interface CalendarStripProps {
  now: Date;
  /** Today's day type, used as the anchor the week's Green/White run counts from. */
  todayDayType: string | null;
  timeFormat: '12h' | '24h';
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MAX_BUBBLE_ROWS = 3;

// "NEXT WEEK" / "THIS WEEK" need about 60px; one 41px column can't hold them.
const MIN_COLUMNS_FOR_CAPTION = 2;

// The Green/White colour is announced too, so the strip doesn't carry that
// distinction in colour alone.
function dayAriaLabel(day: WeekDay, dayType?: string): string {
  const name = `${WEEKDAY_NAMES[day.weekday]}${day.isNextWeek ? ' next week' : ''}`;
  const named = dayType === 'Green Day' || dayType === 'White Day' ? `${name}, ${dayType}` : name;
  if (day.events.length === 0) return named;
  const titles = day.events.map((e) => e.title).join('; ');
  return `${named}: ${titles}`;
}

function openEvent(event: CalendarEvent) {
  if (!event.url) return;
  if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
    chrome.tabs.create({ url: event.url });
  } else {
    window.open(event.url, '_blank', 'noopener');
  }
}

const CalendarStrip: React.FC<CalendarStripProps> = ({ now, todayDayType, timeFormat }) => {
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [dayTypes, setDayTypes] = useState<Record<string, string>>({});

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
    () => (events ? pickDefaultTarget(events, week, now) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, week, minuteKey]
  );

  // Colour every column by its Green/White type, counted forward from today.
  // Today's own type is the only anchor we have, so on a day that is neither
  // (weekend, holiday) the strip simply stays uncoloured.
  const todayKey = week.find((d) => d.isToday)?.key ?? null;

  useEffect(() => {
    const anchor = todayDayType?.toLowerCase() ?? '';
    if (!todayKey || (!anchor.includes('green') && !anchor.includes('white'))) {
      setDayTypes({});
      return undefined;
    }

    let cancelled = false;
    predictDayTypeRange(todayDayType as string, now, week.length)
      .then((types) => {
        if (!cancelled) setDayTypes(types);
      })
      .catch((err) => {
        console.warn('[calendar] Failed to project day types', err);
      });

    return () => {
      cancelled = true;
    };
    // `now` only matters here at day granularity, which `todayKey` already tracks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayDayType, todayKey, week.length]);

  if (!events || events.length === 0) {
    return null;
  }

  const target: BubbleTarget | null =
    hoverIndex !== null && week[hoverIndex] ? targetForWeekDay(week[hoverIndex], hoverIndex) : defaultTarget;

  const pointerIndex = target?.weekIndex ?? null;
  const visibleEvents = target ? target.events.slice(0, MAX_BUBBLE_ROWS) : [];
  const hiddenCount = target ? Math.max(0, target.events.length - MAX_BUBBLE_ROWS) : 0;

  const bubbleClasses = ['calendar-bubble'];
  if (target?.isToday) bubbleClasses.push('today');
  if (pointerIndex !== null) bubbleClasses.push('pointed');

  // Columns left of today have wrapped to next week; a hairline just before today
  // separates them, captioned on whichever sides are wide enough to hold a word.
  const wrapped = wrappedColumnCount(week);
  const thisWeekColumns = week.length - wrapped;
  const dividerStyle = { left: `calc(${wrapped} * 100% / ${week.length})` } as React.CSSProperties;

  // How far the Monday-to-Friday school week has run. Deliberately independent of
  // where today sits in the strip: the columns left of today belong to next week,
  // so filling up to today's column would shade days that haven't happened.

  return (
    <section className="calendar-strip" aria-label="Next seven days" onMouseLeave={() => setHoverIndex(null)}>
      <div className="week-grid">
        <div className="week-caption" aria-hidden="true">
          {wrapped >= MIN_COLUMNS_FOR_CAPTION ? (
            <span className="week-caption-label next" style={{ gridColumn: `1 / span ${wrapped}` }}>
              Next week
            </span>
          ) : null}
          {thisWeekColumns >= MIN_COLUMNS_FOR_CAPTION ? (
            <span className="week-caption-label this" style={{ gridColumn: `${wrapped + 1} / -1` }}>
              This week
            </span>
          ) : null}
        </div>
        {wrapped > 0 ? <span className="week-divider" style={dividerStyle} aria-hidden="true" /> : null}
        <div className="week-row" role="list">
          {week.map((day, index) => {
            const classes = ['week-day'];
            const dayType = dayTypes[day.key];
            if (dayType === 'Green Day') classes.push('green-day');
            else if (dayType === 'White Day') classes.push('white-day');
            if (day.isToday) classes.push('today');
            if (day.isNextWeek) classes.push('next-week');
            if (day.isWeekend) classes.push('weekend');
            if (day.hasEvents) classes.push('has-events');
            if (pointerIndex === index) classes.push('active');

            // A marked day is a real button: hovering shows it in the bubble, clicking
            // opens the first event's page, same as clicking that row in the bubble.
            // Hovering a day with nothing on it drops back to the default, so the
            // bubble never describes a column the cursor has already left.
            return (
              <div
                key={day.key}
                role="listitem"
                className={classes.join(' ')}
                onMouseEnter={() => setHoverIndex(day.hasEvents ? index : null)}
              >
                {day.hasEvents ? (
                  <button
                    type="button"
                    className="week-day-glyph"
                    aria-label={dayAriaLabel(day, dayType)}
                    onFocus={() => setHoverIndex(index)}
                    onBlur={() => setHoverIndex(null)}
                    onClick={() => openEvent(day.events[0])}
                  >
                    !
                  </button>
                ) : (
                  <span className="week-day-glyph" aria-label={dayAriaLabel(day, dayType)}>
                    {day.letter}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div
        className={bubbleClasses.join(' ')}
        style={pointerIndex !== null ? ({ '--pointer-index': pointerIndex } as React.CSSProperties) : undefined}
      >
        {target ? (
          <>
            <span className="calendar-bubble-label">
              <span>{relativeLabel(target.dayKey, now)}</span>
              <span className="calendar-bubble-date">{formatMonthDay(target.dayKey)}</span>
            </span>
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
    </section>
  );
};

export default CalendarStrip;
