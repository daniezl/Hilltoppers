import React, { useEffect, useRef, useState } from 'react';
import { DateTime } from 'luxon';
import ScheduleTimeline from './ScheduleTimeline';
import ScheduleTableRow from './ScheduleTableRow';
import type { TimelineBlock } from './timelineLayout';
import type { SpecialDayRecord } from '../services/scheduleService';
import './scheduleEditor.css';

type Props = {
  date: DateTime;
  initial: TimelineBlock[];
  record?: SpecialDayRecord;
  templates: Record<string, TimelineBlock[]>;
  history: Record<string, SpecialDayRecord>;
  onClose: () => void;
  onSave?: (record: SpecialDayRecord) => Promise<void>;
};
const copy = (blocks: TimelineBlock[]): TimelineBlock[] => blocks.map(block => ({
  ...block, start: block.start.padStart(5, '0'), end: block.end.padStart(5, '0'),
  ...(block.grades ? { grades: [...block.grades] } : {}),
  ...(block.subBlocks ? { subBlocks: copy(block.subBlocks) } : {})
}));
const clean = (blocks: TimelineBlock[]): TimelineBlock[] => blocks.map(block => ({
  ...block, name: block.name.trim(), grades: block.grades?.length ? block.grades : undefined,
  ...(block.subBlocks ? { subBlocks: clean(block.subBlocks) } : {})
}));
const validTime = (time: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
export function scheduleEditorError(blocks: TimelineBlock[]): string | null {
  if (!blocks.length) return 'Add at least one block.';
  for (const block of blocks) {
    if (!block.name.trim()) return 'Give every block a name.';
    if (!validTime(block.start) || !validTime(block.end) || block.start >= block.end) return `${block.name}: the end must be after the start.`;
    if (block.subBlocks?.length) {
      const error = scheduleEditorError(block.subBlocks);
      if (error) return error;
    }
  }
  // Overlaps are intentional for lunch waves and grade-specific activities.
  return null;
}

export default function ScheduleEditor({ date, initial, record, templates, history, onClose, onSave }: Props) {
  const [preview, setPreview] = useState(false);
  const previewDialog = useRef<HTMLDialogElement>(null);
  const nextRowId = useRef(initial.length);
  const rowIds = useRef(initial.map((_, index) => index));
  const dragged = useRef<number | null>(null);
  const [blocks, setBlocks] = useState(() => copy(initial));
  const [title, setTitle] = useState(record?.details ?? '');
  const [picker, setPicker] = useState<'preset' | 'past' | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const baseline = useRef(JSON.stringify({ blocks: copy(initial), title: record?.details ?? '' }));
  const dirty = JSON.stringify({ blocks, title }) !== baseline.current;
  const validation = scheduleEditorError(blocks);
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const close = () => { if (!busy && (!dirty || window.confirm('Discard your unsaved schedule changes?'))) onClose(); };
  const replace = (next: TimelineBlock[], name: string) => {
    if (dirty && !window.confirm('Replace your unsaved schedule with this one?')) return;
    rowIds.current = next.map(() => nextRowId.current++);
    setBlocks(copy(next)); setTitle(name); setPicker(null); setError('');
  };
  const update = (index: number, patch: Partial<TimelineBlock>) => setBlocks(current => current.map((block, i) => i === index ? { ...block, ...patch } : block));
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (validation || busy || !onSave) return;
    setBusy(true); setError('');
    try {
      await onSave({ ...record, type: 'custom', details: title.trim(), schedule: clean(blocks) });
      baseline.current = JSON.stringify({ blocks, title });
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save. Please try again.'); }
    finally { setBusy(false); }
  };
  const presets = [
    { type: date.weekday === 3 ? 'schedule_wed' : 'schedule_mon_thu', label: 'Mon–Thurs / Wednesday' },
    { type: 'schedule_fri', label: 'Friday' }, { type: 'late_start', label: 'Late start' }, { type: 'abdec', label: 'ABDEC' }
  ];
  const past = Object.entries(history).filter(([key, day]) => key < date.toISODate()! && day.type === 'custom' && day.schedule?.length)
    .filter(([key, day]) => `${key} ${day.details ?? ''}`.toLowerCase().includes(search.toLowerCase())).sort(([a], [b]) => b.localeCompare(a));
  useEffect(() => { if (preview) previewDialog.current?.showModal(); }, [preview]);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= blocks.length || from === to) return;
    const ids = [...rowIds.current]; const [id] = ids.splice(from, 1); ids.splice(to, 0, id); rowIds.current = ids;
    setBlocks(current => { const next = [...current]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next; });
  };
  const addBlock = () => {
    rowIds.current.push(nextRowId.current++);
    const start = blocks[blocks.length - 1]?.end || '08:00';
    const [h, m] = start.split(':').map(Number);
    const end = Math.min(h * 60 + m + 30, 1439);
    setBlocks(current => [...current, { name: '', start, end: `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}` }]);
  };
  const overlaps = blocks.flatMap((block, i) => blocks.slice(i + 1).flatMap(other => {
    const sharedGrades = !block.grades?.length || !other.grades?.length || block.grades.some(grade => other.grades!.includes(grade));
    return sharedGrades && validTime(block.start) && validTime(block.end) && validTime(other.start) && validTime(other.end) && block.start < block.end && other.start < other.end && block.start < other.end && other.start < block.end ? [`${block.name || 'Unnamed block'} overlaps ${other.name || 'Unnamed block'}.`] : [];
  }));
  return <section className="admin-calendar schedule-editor">
    <button type="button" onClick={close} disabled={busy}>← Calendar</button>
    <header className="schedule-editor-heading"><div><p>Edit schedule</p><h1 ref={heading} tabIndex={-1}>{date.setLocale('en-US').toFormat('MMMM d, yyyy')}</h1></div>
      <div className="schedule-editor-sources"><button disabled={busy} aria-expanded={picker === 'preset'} onClick={() => setPicker(picker === 'preset' ? null : 'preset')}>Preset ▾</button><button disabled={busy} aria-expanded={picker === 'past'} onClick={() => setPicker(picker === 'past' ? null : 'past')}>Past schedule</button></div>
    </header>
    {picker && <section className="schedule-editor-picker" aria-label={picker === 'preset' ? 'Choose a preset' : 'Choose a past schedule'}>
      <div className="schedule-editor-picker-heading"><strong>{picker === 'preset' ? 'Use a preset' : 'Copy a past schedule'}</strong><button aria-label="Close schedule chooser" onClick={() => setPicker(null)}>×</button></div>
      {picker === 'preset' ? <div className="schedule-editor-preset-list">{presets.map(preset => <button key={preset.type} disabled={!templates[preset.type]?.length} onClick={() => replace(templates[preset.type], preset.label)}>{preset.label}</button>)}</div> : <>
        <input type="search" placeholder="Search by date or name" aria-label="Search past schedules" value={search} onChange={e => setSearch(e.target.value)}/>
        <div className="schedule-editor-history">{past.length ? past.map(([key, day]) => <button key={key} onClick={() => replace(day.schedule!, day.details || 'Special schedule')}><span>{day.details || 'Special schedule'}</span><small>{key}</small></button>) : <p>No past schedules found.</p>}</div>
      </>}
    </section>}
    <form onSubmit={save}>
      <fieldset disabled={busy} className="schedule-editor-fields">
        <label className="schedule-editor-title">Schedule name<input value={title} onChange={e => setTitle(e.target.value)} placeholder="Special schedule" maxLength={120}/></label>
        <p className="schedule-editor-hint">Edit times or duration. Other rows keep their times.</p>
        <div className="schedule-table-scroll"><table className="schedule-edit-table"><caption className="schedule-sr-only">Edit schedule blocks</caption>
          <thead><tr><th scope="col"><span className="schedule-sr-only">Order</span></th><th scope="col">Block</th><th scope="col">Start</th><th scope="col">End</th><th scope="col">Minutes</th><th scope="col"><span className="schedule-sr-only">Options</span></th></tr></thead>
          <tbody>{blocks.map((block, index) => <ScheduleTableRow key={rowIds.current[index]} block={block} index={index} count={blocks.length}
            onChange={patch => update(index, patch)} onMove={to => move(index, to)}
            onDrag={() => { dragged.current = index; }} onDrop={() => { if (dragged.current !== null) move(dragged.current, index); dragged.current = null; }}
            onRemove={() => { if (block.subBlocks?.length && !window.confirm('Delete this block and its lunch waves?')) return; rowIds.current.splice(index, 1); setBlocks(current => current.filter((_, i) => i !== index)); }}/>)}</tbody>
        </table></div>
        <button type="button" onClick={addBlock}>+ Add block</button>
        {!!overlaps.length && <div className="schedule-overlap-notice" role="status"><strong>Check overlapping blocks</strong>{overlaps.map((message, index) => <p key={index}>{message}</p>)}<p>Overlaps are allowed. Adjust them if needed.</p></div>}
        <div className="schedule-preview-action"><button type="button" onClick={() => setPreview(true)}>Preview schedule</button></div>
      </fieldset>
      <footer className="schedule-editor-footer"><div aria-live="polite">{error ? <p role="alert">{error}</p> : validation ? <p>{validation}</p> : <span>{!onSave ? 'Preview only — publishing is not connected yet.' : dirty ? 'Unsaved changes' : 'Editing this date only'}</span>}</div><button type="button" onClick={close} disabled={busy}>Cancel</button><button className="schedule-editor-save" type="submit" disabled={!onSave || busy || !!validation || !dirty}>{busy ? 'Saving…' : 'Save'}</button></footer>
    </form>
    {preview && <dialog ref={previewDialog} className="schedule-table-preview" aria-labelledby="schedule-preview-title" onCancel={() => setPreview(false)} onClick={event => { if (event.target === event.currentTarget) setPreview(false); }}>
      <header><h2 id="schedule-preview-title">{title || 'Schedule preview'}</h2><button type="button" autoFocus aria-label="Close preview" onClick={() => setPreview(false)}>×</button></header>
      <p>{date.setLocale('en-US').toFormat('MMMM d, yyyy')}</p><ScheduleTimeline blocks={blocks} detailsEnabled={false}/>
    </dialog>}
  </section>;
}
