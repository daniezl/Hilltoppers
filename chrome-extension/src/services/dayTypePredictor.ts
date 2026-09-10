import { DateTime } from 'luxon';
import { EST_ZONE } from '../types/schedule';
import { fetchSpecialDaysDict, fetchSpecialPeriods } from './scheduleService';
import { isFirebaseConfigured } from '../firebase/config';

const GREEN_LABEL = 'Green Day';
const WHITE_LABEL = 'White Day';
const NO_SCHOOL_LABEL = 'No School';

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
  if (!isFirebaseConfigured()) {
    return dbDayType;
  }
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

/**
 * Day types for `days` consecutive days starting at `anchorDate`, whose own type
 * is already known. Green and White alternate on school days only, so holidays
 * and weekends report "No School" and leave the alternation where it was.
 *
 * `anchorLabel` must be a Green or White label — on a day that is neither there
 * is nothing to count from, and the caller should skip the projection entirely.
 */
export async function predictDayTypeRange(
  anchorLabel: string,
  anchorDate: Date,
  days: number
): Promise<Record<string, string>> {
  const start = DateTime.fromJSDate(anchorDate, { zone: EST_ZONE }).startOf('day');
  const end = start.plus({ days: days - 1 });

  const [specials, periods] = await Promise.all([
    fetchSpecialDaysDict(start.toJSDate(), end.toJSDate()),
    fetchSpecialPeriods(start.toJSDate(), end.toJSDate())
  ]);

  const result: Record<string, string> = {};
  let isGreen = anchorLabel.toLowerCase().includes('green');
  let cursor = start;

  for (let offset = 0; offset < days; offset += 1) {
    const key = cursor.toFormat('yyyy-LL-dd');
    if (await isSchoolDay(cursor, specials, periods)) {
      // The anchor already carries its own colour; every school day after it flips.
      if (offset > 0) {
        isGreen = !isGreen;
      }
      result[key] = isGreen ? GREEN_LABEL : WHITE_LABEL;
    } else {
      result[key] = NO_SCHOOL_LABEL;
    }
    cursor = cursor.plus({ days: 1 });
  }

  return result;
}
