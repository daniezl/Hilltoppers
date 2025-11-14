import { DateTime } from 'luxon';
import { EST_ZONE } from '../types/schedule';

/**
 * Check if current time is within school hours (6am-4pm EST)
 * @returns true if current time is between 6am and 4pm EST
 */
export function isWithinSchoolHours(): boolean {
  const now = DateTime.now().setZone(EST_ZONE);
  const hour = now.hour;
  // 6am (6) to 4pm (16) - inclusive of 6am, exclusive of 4pm
  return hour >= 6 && hour < 16;
}

/**
 * Get the next time when school hours start (6am EST)
 * If already within school hours, returns current time
 * @returns Date object for next 6am EST
 */
export function getNextSchoolHoursStart(): Date {
  const now = DateTime.now().setZone(EST_ZONE);
  const hour = now.hour;
  
  if (hour >= 6 && hour < 16) {
    // Already in school hours, return current time
    return now.toJSDate();
  }
  
  // Calculate next 6am
  let next6am = now.set({ hour: 6, minute: 0, second: 0, millisecond: 0 });
  
  // If it's already past 4pm today, schedule for tomorrow 6am
  if (hour >= 16) {
    next6am = next6am.plus({ days: 1 });
  }
  
  return next6am.toJSDate();
}

/**
 * Get the next time when school hours end (4pm EST)
 * If already past 4pm, returns next day's 4pm
 * @returns Date object for next 4pm EST
 */
export function getNextSchoolHoursEnd(): Date {
  const now = DateTime.now().setZone(EST_ZONE);
  const hour = now.hour;
  
  let next4pm = now.set({ hour: 16, minute: 0, second: 0, millisecond: 0 });
  
  // If it's already past 4pm today, schedule for tomorrow 4pm
  if (hour >= 16) {
    next4pm = next4pm.plus({ days: 1 });
  }
  
  return next4pm.toJSDate();
}

