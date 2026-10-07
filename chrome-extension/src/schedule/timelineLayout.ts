export const PIXELS_PER_MINUTE = 1;

export type TimelineBlock = {
  name: string;
  start: string;
  end: string;
  grades?: number[];
  subBlocks?: TimelineBlock[];
};
export type TimelineEntry = {
  id: string;
  name: string;
  parentName?: string;
  grades?: number[];
  start: number;
  end: number;
  lane: number;
  lanes: number;
  top: number;
  height: number;
};

function minuteOfDay(value: string): number {
  if (!/^\d{1,2}:\d{2}$/.test(value)) return NaN;
  const [hour, minute] = value.split(':').map(Number);
  return hour < 24 && minute < 60 ? hour * 60 + minute : NaN;
}

export function timeLabel(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

export function buildTimeline(blocks: TimelineBlock[]) {
  const entries: TimelineEntry[] = [];
  let invalidCount = 0;
  const collect = (block: TimelineBlock, id: string, parentName?: string, inheritedGrades?: number[]) => {
    const start = minuteOfDay(block.start);
    const end = minuteOfDay(block.end);
    const grades = block.grades ?? inheritedGrades;
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      entries.push({ id, name: block.name, parentName, grades, start, end, lane: 0, lanes: 1, top: 0, height: (end - start) * PIXELS_PER_MINUTE });
    } else invalidCount++;
    block.subBlocks?.forEach((child, index) => collect(child, `${id}.${index}`, block.name, grades));
  };
  blocks.forEach((block, index) => collect(block, String(index)));
  entries.sort((a, b) => a.start - b.start || b.end - a.end || a.id.localeCompare(b.id));
  const start = Math.floor(Math.min(450, ...entries.map(entry => entry.start)) / 30) * 30;
  const end = Math.ceil(Math.max(960, ...entries.map(entry => entry.end)) / 30) * 30;

  // Only horizontal lanes resolve overlaps. Vertical coordinates always remain real minutes.
  let group: TimelineEntry[] = [];
  let groupEnd = -1;
  let laneEnds: number[] = [];
  const finishGroup = () => group.forEach(entry => { entry.lanes = laneEnds.length; });
  for (const entry of entries) {
    if (entry.start >= groupEnd) {
      finishGroup();
      group = [];
      laneEnds = [];
    }
    let lane = laneEnds.findIndex(laneEnd => laneEnd <= entry.start);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = entry.end;
    entry.lane = lane;
    entry.top = (entry.start - start) * PIXELS_PER_MINUTE;
    group.push(entry);
    groupEnd = Math.max(groupEnd, entry.end);
  }
  finishGroup();
  const ticks = Array.from({ length: (end - start) / 30 + 1 }, (_, index) => start + index * 30);
  return { entries, start, end, ticks, height: (end - start) * PIXELS_PER_MINUTE, invalidCount };
}
