import { createHash } from 'node:crypto';
import { addDays, isWeekend } from './ics.mjs';

export function isResolved(date, days, periods) {
  const entry = days[date];
  return entry?.type === 'no_school' ||
    Boolean(entry?.schedule?.length) || periods.some(p => p.start <= date && date <= p.end);
}

export function buildScheduleReviews({ today, needsHuman, days, periods }) {
  const groups = {};
  const horizon = addDays(today, 45);
  for (const item of needsHuman) {
    if (isWeekend(item.date)) continue;
    // Include the occurrence start: calendar UIDs can be reused in later years.
    const id = createHash('sha256').update(JSON.stringify([
      item.eventId ?? item.title, item.eventStart ?? item.date
    ])).digest('hex').slice(0, 24);
    const review = groups[id] ??= { title: item.title, dates: [], reasons: [] };
    if (!review.dates.includes(item.date)) review.dates.push(item.date);
    const reason = `${item.title} (${item.reason})`;
    if (!review.reasons.includes(reason)) review.reasons.push(reason);
  }
  return Object.fromEntries(Object.entries(groups).filter(([, review]) => {
    review.dates.sort();
    return review.dates.some(date => date >= today && date <= horizon && !isResolved(date, days, periods));
  }).sort(([, a], [, b]) => a.dates[0].localeCompare(b.dates[0])));
}
