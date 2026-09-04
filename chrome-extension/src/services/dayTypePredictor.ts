import { DateTime } from 'luxon';
import { EST_ZONE } from '../types/schedule';
import { fetchSpecialDaysDict, fetchSpecialPeriods } from './scheduleService';

const GREEN_LABEL = 'Green Day';
const WHITE_LABEL = 'White Day';

function isWeekend(date: DateTime): boolean {
  return date.weekday === 6 || date.weekday === 7;
}

async function isSchoolDay(date: DateTime, specials: Record<string, string>, periods: Array<{ start: string; end: string; details?: string }>): Promise<boolean> {
  const key = date.toFormat('yyyy-LL-dd');
  if (key in specials) {
    return specials[key] !== 'no_school';
  }

  // Compare date strings (EST format: "yyyy-LL-dd")
  for (const period of periods) {
    if (key >= period.start && key <= period.end) {
      return false;
    }
  }

  if (isWeekend(date)) {
    return false;
  }

  return true;
}

export async function predictDayType(dbDayType: string, dbDate: Date, testDate?: Date): Promise<string> {
  // This used to return early when Firebase was not configured — a leftover
  // from when the calendar lived in Firestore. The calendar comes from Pages
  // now, so that check only ever meant "a build without .env.local shows
  // yesterday's colour whenever the bulletin is a day behind", which it
  // usually is.
  const today = DateTime.fromJSDate(testDate ?? new Date(), { zone: EST_ZONE }).startOf('day');
  const base = DateTime.fromJSDate(dbDate, { zone: EST_ZONE }).startOf('day');

  const specials = await fetchSpecialDaysDict(base.toJSDate(), today.toJSDate());
  const periods = await fetchSpecialPeriods(base.toJSDate(), today.toJSDate());

  let predictIsGreen = dbDayType.toLowerCase().includes('green');
  let cursor = base.plus({ days: 1 });

  while (cursor <= today) {
    if (await isSchoolDay(cursor, specials, periods)) {
      predictIsGreen = !predictIsGreen;
    }
    cursor = cursor.plus({ days: 1 });
  }

  return predictIsGreen ? GREEN_LABEL : WHITE_LABEL;
}
