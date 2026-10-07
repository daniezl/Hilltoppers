import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { classifyCustom, familyForType, presetTypes } from './scheduleFamily';
import type { TimelineBlock } from './timelineLayout';

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const templates: Record<string, TimelineBlock[]> = Object.fromEntries(presetTypes.map(type => [type, read(`../../public/schedule/${type}.json`)]));
const days = read('../../../data/public/special_days.json');

describe('admin calendar schedule families', () => {
  it('recognizes the exact Friday timetable stored as custom on September 3', () => {
    expect(classifyCustom(days['2026-09-03'].schedule, templates)).toEqual({ family: 'friday', modified: false });
  });
  it('recognizes modified ABDEC without changing the September 25 timetable', () => {
    const blocks = structuredClone(days['2026-09-25'].schedule);
    expect(classifyCustom(blocks, templates)).toEqual({ family: 'abdec', modified: true });
    expect(blocks).toEqual(days['2026-09-25'].schedule);
  });
  it('keeps genuinely different timetables custom', () => {
    for (const date of ['2025-12-05', '2026-04-16', '2026-05-15']) {
      expect(classifyCustom(days[date].schedule, templates), date).toEqual({ family: 'custom', modified: false });
    }
  });
  it('recognizes ABDEC teaching order despite changed times, activities, or grades', () => {
    for (const date of ['2026-02-04', '2026-02-05', '2026-05-27']) {
      const blocks = structuredClone(days[date].schedule);
      expect(classifyCustom(blocks, templates), date).toEqual({ family: 'abdec', modified: true });
      expect(blocks).toEqual(days[date].schedule);
    }
  });
  it('keeps exact ABDEC unmodified and rejects missing or repeated teaching blocks', () => {
    expect(classifyCustom(templates.abdec, templates)).toEqual({ family: 'abdec', modified: false });
    for (const blocks of [templates.abdec.slice(1), [...templates.abdec, templates.abdec[0]]]) {
      expect(classifyCustom(blocks, templates)).toEqual({ family: 'custom', modified: false });
    }
  });
  it('groups the two regular presets while keeping the other families distinct', () => {
    expect(presetTypes.map(familyForType)).toEqual(['normal', 'normal', 'friday', 'late', 'abdec']);
  });
});
