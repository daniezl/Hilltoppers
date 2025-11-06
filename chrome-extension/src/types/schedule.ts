import { DateTime } from 'luxon';

export interface SubBlock {
  id: string;
  name: string;
  start: string;
  end: string;
}

export interface Block {
  id: string;
  name: string;
  start: string;
  end: string;
  subBlocks?: SubBlock[];
}

export const EST_ZONE = 'America/New_York';

export function parseBlockTime(time: string, base: Date): Date {
  const [hour, minute] = time.split(':').map(Number);
  return DateTime.fromJSDate(base, { zone: EST_ZONE })
    .set({ hour, minute, second: 0, millisecond: 0 })
    .toJSDate();
}

export function minutesUntil(target: Date, from: Date = new Date()): number {
  const diff = target.getTime() - from.getTime();
  return Math.floor(diff / 60000);
}

export function isFuture(target: Date, from: Date = new Date()): boolean {
  return target.getTime() > from.getTime();
}

export function toDisplayTime(date: Date, format: '12h' | '24h' = '12h'): string {
  const dt = DateTime.fromJSDate(date, { zone: EST_ZONE });
  return format === '24h' ? dt.toFormat('HH:mm') : dt.toFormat('h:mm');
}
