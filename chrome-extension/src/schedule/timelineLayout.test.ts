import { describe, expect, it } from 'vitest';
import { buildTimeline } from './timelineLayout';

describe('proportional schedule timeline', () => {
  it('keeps exact duration, gaps, and very short blocks without a minimum height', () => {
    const result = buildTimeline([
      { name: 'Chapel', start: '08:00', end: '08:15' },
      { name: 'A', start: '08:25', end: '09:30' },
      { name: 'Check-in', start: '09:35', end: '09:36' }
    ]);
    expect(result.start).toBe(450);
    expect(result.end).toBe(960);
    expect(result.entries.map(e => [e.top, e.height])).toEqual([[30, 15], [55, 65], [125, 1]]);
    expect(result.entries[1].top - (result.entries[0].top + result.entries[0].height)).toBe(10);
    expect(result.entries.every(e => e.lane === 0 && e.lanes === 1)).toBe(true);
  });

  it('puts overlapping lunch waves and grade-specific blocks in separate lanes without shifting times', () => {
    const result = buildTimeline([
      { name: 'C Block', start: '10:45', end: '12:20', grades: [9, 10], subBlocks: [
        { name: 'Lunch 1', start: '10:45', end: '11:20' },
        { name: 'Lunch 2', start: '11:05', end: '11:40' }
      ] },
      { name: 'Assembly', start: '10:45', end: '11:30', grades: [11, 12] },
      { name: 'D', start: '12:25', end: '13:30' }
    ]);
    for (const entry of result.entries) {
      for (const other of result.entries) {
        if (entry.id !== other.id && entry.start < other.end && other.start < entry.end) expect(entry.lane).not.toBe(other.lane);
      }
    }
    const lunch = result.entries.find(e => e.name === 'Lunch 2')!;
    expect(lunch.top).toBe(215);
    expect(lunch.height).toBe(35);
    expect(lunch.parentName).toBe('C Block');
    expect(lunch.grades).toEqual([9, 10]);
    expect(result.entries.find(e => e.name === 'D')?.lanes).toBe(1);
  });

  it('extends the range for early or late events and does not invent times for invalid entries', () => {
    const result = buildTimeline([
      { name: 'Early', start: '7:10', end: '07:25' },
      { name: 'Evening', start: '18:00', end: '20:10' },
      { name: 'Invalid', start: '12:90', end: '13:00' },
      { name: 'Reversed', start: '10:00', end: '09:00' }
    ]);
    expect(result.start).toBe(420);
    expect(result.end).toBe(1230);
    expect(result.height).toBe(810);
    expect(result.entries.map(e => e.height)).toEqual([15, 130]);
    expect(result.invalidCount).toBe(2);
    expect(result.ticks[0]).toBe(420);
    expect(result.ticks[result.ticks.length - 1]).toBe(1230);
  });
});
