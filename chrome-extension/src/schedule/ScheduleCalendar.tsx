import React, { useCallback, useEffect, useState } from 'react';
import { DateTime } from 'luxon';
import { fetchDayTypes, type DayTypeMap } from '../services/dayTypeService';
import { fetchSpecialDays, fetchSpecialPeriodsList, loadScheduleByType, type SpecialDayRecord, type SpecialPeriod } from '../services/scheduleService';
import { fetchCalendarEvents, type CalendarEvent } from '../services/calendarService';
import { EST_ZONE } from '../types/schedule';
import './scheduleCalendar.css';
import SchedulePopover from './SchedulePopover';
import PresetSchedules from './PresetSchedules';
import { classifyCustom, familyForType, familyLabels, presetTypes } from './scheduleFamily';
import type { TimelineBlock } from './timelineLayout';

type CalendarData = { templates: Record<string, TimelineBlock[]>; availableTypes: Set<string>; events: CalendarEvent[]; colors: DayTypeMap; days: Record<string, SpecialDayRecord>; periods: SpecialPeriod[] };
type Color = 'special' | 'pending' | 'normal' | 'off';
const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function usableBlocks(blocks: unknown): boolean {
  if (!Array.isArray(blocks) || !blocks.length) return false;
  const minutes = (value: unknown): number => {
    if (typeof value !== 'string' || !/^\d{1,2}:\d{2}$/.test(value)) return NaN;
    const [h, m] = value.split(':').map(Number);
    return h < 24 && m < 60 ? h * 60 + m : NaN;
  };
  return blocks.every(block => block && typeof block.name === 'string' && block.name.trim() && minutes(block.start) < minutes(block.end));
}

function noSchoolReason(day: DateTime, data: CalendarData): string {
  const key = day.toISODate()!;
  const period = data.periods.find(p => p.start <= key && key <= p.end);
  if (period) return period.details?.trim() || 'School break';
  const special = data.days[key];
  if (special?.type === 'no_school') return special.details?.trim() || 'No school';
  return day.weekday > 5 ? '' : 'No school';
}

function dayColor(day: DateTime, data: CalendarData): Color {
  const key = day.toISODate()!;
  const special = data.days[key];
  const published = data.colors[key];
  // Break ranges take precedence in the schedule service too.
  const period = data.periods.some(p => p.start <= key && key <= p.end);
  const off = period || (special?.type ? special.type === 'no_school' : day.weekday > 5 || published === 'No School');
  if (off) return 'off';
  if (special?.type === 'custom' && usableBlocks(special.schedule)) return 'special';
  if (special?.type && data.availableTypes.has(special.type)) {
    const regular = day.weekday === 3 ? 'schedule_wed' : day.weekday === 5 ? 'schedule_fri' : day.weekday < 6 ? 'schedule_mon_thu' : null;
    return special.type === regular ? 'normal' : 'special';
  }
  const needsConfirmation = Boolean(special?.type) ||
    data.events.some(event => event.kind === 'schedule' && event.start <= key && key <= event.end);
  return needsConfirmation ? 'pending' : 'normal';
}

function dayAppearance(day: DateTime, data: CalendarData) {
  const status = dayColor(day, data);
  if (status === 'off') return { family: 'off' as const, label: 'No school' };
  const record = data.days[day.toISODate()!];
  if (record?.type === 'custom' && usableBlocks(record.schedule)) {
    const match = classifyCustom(record.schedule!, data.templates);
    return { family: match.family, label: `${match.modified ? 'Modified ' : ''}${familyLabels[match.family]}` };
  }
  const type = record?.type && data.availableTypes.has(record.type) ? record.type : day.weekday === 3 ? 'schedule_wed' : day.weekday === 5 ? 'schedule_fri' : 'schedule_mon_thu';
  const family = familyForType(type);
  return { family, label: family === 'normal' ? `${day.setLocale('en-US').toFormat('cccc')} schedule` : familyLabels[family] };
}

function scheduleName(key: string, data: CalendarData): string {
  const special = data.days[key];
  if (special?.details?.trim()) return special.details.trim();
  const events = data.events.filter(event => event.kind === 'schedule' && event.start <= key && key <= event.end);
  const names = [...new Set(events.map(event => event.title.trim()).filter(Boolean))];
  if (names.length) return names.join(' · ');
  const types: Record<string, string> = { late_start: 'Late start', abdec: 'ABDEC', custom: 'Special schedule', schedule_fri: 'Friday schedule', schedule_wed: 'Wednesday schedule', schedule_mon_thu: 'Regular schedule' };
  return types[special?.type ?? ''] ?? special?.type?.replace(/_/g, ' ') ?? 'Special schedule';
}

export default function ScheduleCalendar() {
  const [showPresets, setShowPresets] = useState<HTMLButtonElement | null>(null);
  const today = DateTime.now().setZone(EST_ZONE);
  const [month, setMonth] = useState(() => today.startOf('month'));
  const [selection, setSelection] = useState<{ day: DateTime; anchor: HTMLButtonElement } | null>(null);
  const closePopover = useCallback(() => setSelection(null), []);
  useEffect(() => { setSelection(null); }, [month]);
  const [data, setData] = useState<CalendarData | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setError(false);
    setData(null);
    Promise.all([fetchDayTypes(), fetchSpecialDays(), fetchSpecialPeriodsList(), fetchCalendarEvents()])
      .then(async ([colors, days, periods, events]) => {
        if (!days || !periods) throw new Error('Calendar data unavailable');
        const types = [...new Set([...presetTypes, ...Object.values(days).map(day => day.type).filter((type): type is string => Boolean(type) && type !== 'custom' && type !== 'no_school')])];
        const availableTypes = new Set<string>();
        const templates: Record<string, TimelineBlock[]> = {};
        await Promise.all(types.map(async type => {
          const blocks = await loadScheduleByType(type);
          if (usableBlocks(blocks)) { availableTypes.add(type); templates[type] = blocks!; }
        }));
        if (!cancelled) setData({ colors, days, periods, events, availableTypes, templates });
      })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [attempt]);
  const offset = month.weekday % 7;
  const start = month.minus({ days: offset });
  const count = Math.ceil((offset + month.daysInMonth!) / 7) * 7;
  const dates = Array.from({ length: count }, (_, i) => start.plus({ days: i }));
  const selectedAppearance = selection && data ? dayAppearance(selection.day, data) : null;
  return <section className="admin-calendar" aria-labelledby="admin-schedule-title">
    <header className="admin-calendar-heading"><h1 id="admin-schedule-title">Schedule</h1><button type="button" onClick={event => { setSelection(null); setShowPresets(event.currentTarget); }}>View all schedules</button></header>
    <div className="admin-calendar-card">
      <div className="admin-calendar-toolbar">
        <h2 aria-live="polite">{month.setLocale('en-US').toFormat('MMMM yyyy')}</h2>
        <div className="admin-calendar-controls">
          <button type="button" onClick={() => setMonth(DateTime.now().setZone(EST_ZONE).startOf('month'))}>Today</button>
          <button type="button" aria-label="Previous month" onClick={() => setMonth(m => m.minus({ months: 1 }))}><span aria-hidden="true">‹</span></button>
          <button type="button" aria-label="Next month" onClick={() => setMonth(m => m.plus({ months: 1 }))}><span aria-hidden="true">›</span></button>
        </div>
      </div>
      {error ? <div className="admin-calendar-message" role="alert"><p>Couldn't load the calendar.</p><button type="button" onClick={() => setAttempt(a => a + 1)}>Try again</button></div> : !data ?
        <p className="admin-calendar-message" role="status">Loading calendar…</p> :
        <table className="admin-calendar-grid" aria-label={month.setLocale('en-US').toFormat('MMMM yyyy')}>
          <thead><tr>{weekdays.map(day => <th scope="col" key={day}>{day}</th>)}</tr></thead>
          <tbody>{Array.from({ length: count / 7 }, (_, row) => <tr key={row}>
            {dates.slice(row * 7, row * 7 + 7).map(day => {
              const outside = day.month !== month.month;
              const color = dayColor(day, data);
              const appearance = dayAppearance(day, data);
              const isToday = day.hasSame(today, 'day');
              const name = color === 'off' ? noSchoolReason(day, data) : color !== 'normal' ? scheduleName(day.toISODate()!, data) : null;
              return <td key={day.toISODate()} className={outside ? 'admin-calendar-outside' : ''}>
                {!outside && <button type="button" aria-haspopup="dialog" aria-expanded={selection?.day.hasSame(day, 'day') ?? false} aria-controls={selection?.day.hasSame(day, 'day') ? 'schedule-popover' : undefined} onClick={event => { const anchor = event.currentTarget; setSelection(current => current?.day.hasSame(day, 'day') ? null : { day, anchor }); }} className={`admin-calendar-date admin-calendar-${appearance.family}${isToday ? ' admin-calendar-today' : ''}`}
                  aria-label={`${day.setLocale('en-US').toFormat('cccc, LLLL d, yyyy')}: ${appearance.label}${color === 'pending' ? ', potential schedule change' : ''}${name ? `, ${name}` : ''}${isToday ? ', today' : ''}`}
                  aria-current={isToday ? 'date' : undefined}>
                  <span>{day.day}</span>{name && <span className="admin-calendar-event-name">{name}</span>}
                </button>}
              </td>;
            })}
          </tr>)}</tbody>
        </table>}
      <div className="admin-calendar-legend" aria-label="Calendar colors">
        {(['normal', 'friday', 'late', 'abdec', 'custom'] as const).map(color => <span key={color}><i className={`admin-calendar-swatch admin-calendar-${color}`} aria-hidden="true"/>{familyLabels[color]}</span>)}
      </div>
    </div>
    {showPresets && <PresetSchedules anchor={showPresets} onBack={() => setShowPresets(null)} />}
    {selection && data && <SchedulePopover key={selection.day.toISODate()} date={selection.day} anchor={selection.anchor}
      status={dayColor(selection.day, data)} label={selectedAppearance!.label} family={selectedAppearance!.family}
      name={dayColor(selection.day, data) === 'off' ? noSchoolReason(selection.day, data) : dayColor(selection.day, data) !== 'normal' ? scheduleName(selection.day.toISODate()!, data) : ''}
      record={data.days[selection.day.toISODate()!]} customValid={usableBlocks(data.days[selection.day.toISODate()!]?.schedule)}
      typeAvailable={data.availableTypes.has(data.days[selection.day.toISODate()!]?.type ?? '')} onClose={closePopover} />}
  </section>;
}
