import type { TimelineBlock } from './timelineLayout';

export type ScheduleFamily = 'normal' | 'friday' | 'late' | 'abdec' | 'custom' | 'off';
export const familyLabels: Record<ScheduleFamily, string> = {
  normal: 'Mon–Thurs / Wednesday', friday: 'Friday schedule', late: 'Late start',
  abdec: 'ABDEC', custom: 'Custom schedule', off: 'No school'
};
export const presetTypes = ['schedule_mon_thu', 'schedule_wed', 'schedule_fri', 'late_start', 'abdec'];
export function familyForType(type: string): ScheduleFamily {
  return ({ schedule_mon_thu: 'normal', schedule_wed: 'normal', schedule_fri: 'friday', late_start: 'late', abdec: 'abdec', no_school: 'off' } as Record<string, ScheduleFamily>)[type] ?? 'custom';
}
function signature(blocks: TimelineBlock[]): string {
  return JSON.stringify(blocks.map(block => ({
    name: block.name.trim(), start: block.start.padStart(5, '0'), end: block.end.padStart(5, '0'),
    grades: [...(block.grades ?? [])].sort(), children: signature(block.subBlocks ?? [])
  })));
}
export function classifyCustom(blocks: TimelineBlock[], templates: Record<string, TimelineBlock[]>) {
  for (const type of presetTypes) {
    if (templates[type]?.length && signature(blocks) === signature(templates[type])) return { family: familyForType(type), modified: false };
  }
  // Family classification uses teaching order; lunches, activities, and grade restrictions stay in the original data.
  const teachingOrder = blocks
    .map(block => ({ letter: /^([A-E])(?:\s+Block)?$/i.exec(block.name.trim())?.[1].toUpperCase(), start: block.start }))
    .filter(block => block.letter)
    .sort((a, b) => a.start.padStart(5, '0').localeCompare(b.start.padStart(5, '0')))
    .map(block => block.letter)
    .join('');
  if (teachingOrder === 'ABDEC') {
    return { family: 'abdec' as ScheduleFamily, modified: true };
  }
  return { family: 'custom' as ScheduleFamily, modified: false };
}
