import { DateTime } from 'luxon';

export type GradeLevel = 9 | 10 | 11 | 12;

export const GRADE_LABELS: Record<GradeLevel, string> = {
  9: 'Freshman',
  10: 'Sophomore',
  11: 'Junior',
  12: 'Senior'
};

export const GRADE_LABELS_PLURAL: Record<GradeLevel, string> = {
  9: 'Freshmen',
  10: 'Sophomores',
  11: 'Juniors',
  12: 'Seniors'
};

export const ALL_GRADES: GradeLevel[] = [9, 10, 11, 12];

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
  grades?: number[];
}

export const EST_ZONE = 'America/New_York';

export function getCurrentSchoolYear(): number {
  const now = DateTime.now().setZone(EST_ZONE);
  return now.month >= 7 ? now.year + 1 : now.year;
}

export function gradeFromGraduationYear(gradYear: number): GradeLevel {
  const grade = 12 - (gradYear - getCurrentSchoolYear());
  return Math.max(9, Math.min(12, grade)) as GradeLevel;
}

export function graduationYearFromGrade(grade: GradeLevel): number {
  return getCurrentSchoolYear() + (12 - grade);
}

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
