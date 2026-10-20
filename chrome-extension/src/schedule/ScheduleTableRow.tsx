import React, { useEffect, useId, useState } from 'react';
import type { TimelineBlock } from './timelineLayout';
const minutes = (time: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : NaN;
function TimeCells({ block, label, onChange }: { block: TimelineBlock; label: string; onChange: (patch: Partial<TimelineBlock>) => void }) {
  const length = minutes(block.end) - minutes(block.start);
  const [duration, setDuration] = useState(Number.isFinite(length) ? String(length) : '');
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setDuration(Number.isFinite(length) ? String(length) : ''); }, [length, editing]);
  return <>
    <td><input type="time" required aria-label={`${label} start`} value={block.start} onChange={e => onChange({ start: e.target.value })}/></td>
    <td><input type="time" required aria-label={`${label} end`} value={block.end} onChange={e => onChange({ end: e.target.value })}/></td>
    <td><input type="number" min="1" max="1439" step="1" required aria-label={`${label} minutes`} value={duration} onFocus={() => setEditing(true)} onBlur={() => setEditing(false)} onChange={e => {
      const value = e.target.value; setDuration(value);
      const count = Number(value); const end = minutes(block.start) + count;
      onChange({ end: value && Number.isInteger(count) && count > 0 && end < 1440 ? `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}` : '' });
    }}/></td>
  </>;
}
type Props = { block: TimelineBlock; index: number; count: number; onChange: (patch: Partial<TimelineBlock>) => void; onMove: (to: number) => void; onRemove: () => void; onDrag: () => void; onDrop: () => void };
export default function ScheduleTableRow({ block, index, count, onChange, onMove, onRemove, onDrag, onDrop }: Props) {
  const label = `Block ${index + 1}`;
  const choices = useId();
  const panelId = useId();
  const [options, setOptions] = useState(false);
  const [segments, setSegments] = useState(false);
  const lunch = /^c(?:\s+block)?$/i.test(block.name.trim()) || /\blunch\b/i.test(block.name) || block.subBlocks?.some(sub => /\blunch\b/i.test(sub.name));
  const segmentLabel = lunch ? 'Lunch waves' : 'Sub-blocks';
  return <><tr onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); onDrop(); }}>
    <td><button className="schedule-drag" type="button" draggable aria-label={`Drag ${label}`} title="Drag to reorder" onDragStart={e => { e.dataTransfer.setData('text/plain', String(index)); onDrag(); }}>⠿</button></td>
    <td><div className="schedule-name-cell"><input list={choices} autoComplete="off" required aria-label={`${label} name`} placeholder="Choose or type…" value={block.name} onChange={e => onChange({ name: e.target.value })}/>
      <datalist id={choices}>{['A Block', 'B Block', 'C Block', 'D Block', 'E Block', 'Chapel', 'Advisory', 'CP', 'Lunch'].map(name => <option key={name} value={name}/>)}</datalist>
      {(lunch || !!block.subBlocks?.length) && <button className="schedule-segments-toggle" type="button" aria-label={`${label} ${segmentLabel.toLowerCase()}`} aria-expanded={segments} aria-controls={panelId} onClick={() => setSegments(!segments)}>{segmentLabel}{block.subBlocks?.length ? ` · ${block.subBlocks.length}` : ''}</button>}
    </div></td>
    <TimeCells block={block} label={label} onChange={onChange}/>
    <td><button className="schedule-row-more" type="button" aria-label={`${label} options`} aria-expanded={options} aria-controls={panelId} onClick={() => setOptions(!options)}>⋯</button></td>
  </tr>{(options || segments) && <tr className="schedule-row-details"><td/><td colSpan={5}><div id={panelId}>
    {options && <div className="schedule-row-options">
      <div className="schedule-row-actions"><button type="button" disabled={index === 0} onClick={() => onMove(index - 1)}>Move up</button><button type="button" disabled={index === count - 1} onClick={() => onMove(index + 1)}>Move down</button><button type="button" onClick={() => setSegments(!segments)}>{segments ? 'Hide sub-blocks' : 'Edit sub-blocks'}</button><button className="schedule-delete" type="button" aria-label={`Delete ${label}`} onClick={onRemove}>Delete</button></div>
      <div className="schedule-editor-grades"><span>Grades (all if none selected)</span>{[9, 10, 11, 12].map(grade => <label key={grade}><input type="checkbox" checked={block.grades?.includes(grade) ?? false} onChange={e => onChange({ grades: e.target.checked ? [...(block.grades ?? []), grade].sort() : block.grades?.filter(g => g !== grade) })}/>{grade}</label>)}</div>
    </div>}
    {segments && <div className="schedule-segments">
      {!!block.subBlocks?.length && <table className="schedule-lunch-table"><caption>{segmentLabel}</caption><thead><tr><th>Name</th><th>Start</th><th>End</th><th>Minutes</th><th><span className="schedule-sr-only">Delete</span></th></tr></thead><tbody>{block.subBlocks.map((sub, i) => <tr key={i}><td><input aria-label={`${label} segment ${i + 1} name`} required value={sub.name} onChange={e => onChange({ subBlocks: block.subBlocks!.map((s, n) => n === i ? { ...s, name: e.target.value } : s) })}/></td><TimeCells block={sub} label={`${label} segment ${i + 1}`} onChange={patch => onChange({ subBlocks: block.subBlocks!.map((s, n) => n === i ? { ...s, ...patch } : s) })}/><td><button type="button" aria-label={`Delete ${label} segment ${i + 1}`} onClick={() => onChange({ subBlocks: block.subBlocks!.filter((_, n) => n !== i) })}>×</button></td></tr>)}</tbody></table>}
      <button type="button" onClick={() => onChange({ subBlocks: [...(block.subBlocks ?? []), { name: lunch ? 'Lunch' : 'New sub-block', start: block.start, end: block.end }] })}>{lunch ? '+ Add lunch wave' : '+ Add sub-block'}</button>
    </div>}
  </div></td></tr>}</>;
}
