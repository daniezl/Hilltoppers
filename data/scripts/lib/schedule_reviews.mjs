import { addDays, isWeekend } from './ics.mjs';

export function isResolved(date, days, periods) {
  const entry = days[date];
  return entry?.type === 'no_school' ||
    Boolean(entry?.schedule?.length) || periods.some(p => p.start <= date && date <= p.end);
}

export function buildScheduleReviews({ today, needsHuman, days, periods }) {
  const reviews = {};
  const horizon = addDays(today, 45);
  for (const item of needsHuman) {
    if (item.date < today || item.date > horizon || isWeekend(item.date) || isResolved(item.date, days, periods)) continue;
    const review = reviews[item.date] ??= { reasons: [] };
    const reason = `${item.title} (${item.reason})`;
    if (!review.reasons.includes(reason)) review.reasons.push(reason);
  }
  return Object.fromEntries(Object.entries(reviews).sort(([a], [b]) => a.localeCompare(b)));
}
