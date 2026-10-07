import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { buildTimeline, PIXELS_PER_MINUTE, timeLabel, type TimelineBlock } from './timelineLayout';

export default function ScheduleTimeline({ blocks, detailsEnabled = true }: { blocks: TimelineBlock[]; detailsEnabled?: boolean }) {
  const timeline = useMemo(() => buildTimeline(blocks), [blocks]);
  const [hovered, setHovered] = useState<{ id: string; anchor: HTMLButtonElement } | null>(null);
  useEffect(() => { if (!detailsEnabled) setHovered(null); }, [detailsEnabled]);
  const detail = useRef<HTMLDivElement>(null);
  const active = timeline.entries.find(entry => entry.id === hovered?.id);
  const dialog = hovered?.anchor.closest('dialog');
  useLayoutEffect(() => {
    if (!hovered || !dialog || !detail.current) return;
    const anchor = hovered.anchor.getBoundingClientRect();
    const bounds = dialog.getBoundingClientRect();
    const tooltip = detail.current.getBoundingClientRect();
    const gap = 10;
    const preferredLeft = anchor.right + gap + tooltip.width <= window.innerWidth - gap
      ? anchor.right + gap : anchor.left - tooltip.width - gap;
    const left = Math.max(gap, Math.min(preferredLeft, window.innerWidth - tooltip.width - gap));
    const top = Math.max(gap, Math.min(anchor.top + (anchor.height - tooltip.height) / 2, window.innerHeight - tooltip.height - gap));
    detail.current.style.left = `${left - bounds.left}px`;
    detail.current.style.top = `${top - bounds.top}px`;
  }, [hovered, dialog]);
  useEffect(() => {
    if (!hovered) return;
    const hide = () => setHovered(null);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [hovered]);
  return <div className="schedule-timeline" aria-label="Proportional schedule timeline">
    {timeline.invalidCount > 0 && <p className="schedule-popover-notice">Some entries have invalid times and cannot be placed on the timeline.</p>}
    {detailsEnabled && active && dialog && createPortal(<div ref={detail} className="schedule-timeline-detail" role="tooltip" id="schedule-course-detail">
      <strong>{active.name}</strong>
      <span>{timeLabel(active.start)}–{timeLabel(active.end)} · {active.end - active.start} min</span>
      {active.parentName && <small>{active.parentName}</small>}
      {active.grades?.length ? <small>Grades {active.grades.join(', ')}</small> : null}
    </div>, dialog)}
    <div className="schedule-timeline-frame">
      <div className="schedule-timeline-plane" style={{ height: timeline.height }}>
        <div className="schedule-timeline-rules" aria-hidden="true">
          {timeline.ticks.map(minute => <div key={minute} className={`schedule-timeline-rule${minute % 60 === 0 ? ' is-hour' : ''}`} style={{ top: (minute - timeline.start) * PIXELS_PER_MINUTE }} />)}
        </div>
        <ol className="schedule-timeline-courses" aria-label="Classes and overlapping time slots">
          {timeline.entries.map(entry => {
            const description = `${entry.name}, ${timeLabel(entry.start)}–${timeLabel(entry.end)}, ${entry.end - entry.start} minutes${entry.parentName ? `, ${entry.parentName}` : ''}${entry.grades?.length ? `, grades ${entry.grades.join(', ')}` : ''}`;
            return <li key={entry.id} className="schedule-timeline-slot" style={{ top: entry.top, height: entry.height, left: `${entry.lane / entry.lanes * 100}%`, width: `${100 / entry.lanes}%` }}>
              <button type="button" className={`schedule-timeline-block${entry.parentName ? ' is-subblock' : ''}${entry.height < 42 ? ' is-short' : ''}${detailsEnabled && hovered?.id === entry.id ? ' is-active' : ''}`}
                aria-label={description} aria-describedby={detailsEnabled && hovered?.id === entry.id ? 'schedule-course-detail' : undefined}
                onMouseMove={event => {
                  // A flying card can cross a stationary pointer; only deliberate movement activates a block.
                  if (detailsEnabled && (event.movementX !== 0 || event.movementY !== 0) && hovered?.id !== entry.id) {
                    setHovered({ id: entry.id, anchor: event.currentTarget });
                  }
                }}
                onMouseLeave={() => setHovered(null)}
                onFocus={event => { if (detailsEnabled && event.currentTarget.matches(':focus-visible')) setHovered({ id: entry.id, anchor: event.currentTarget }); }}
                onBlur={() => setHovered(null)}
                onKeyDown={event => { if (event.key === 'Escape' && hovered) { event.stopPropagation(); setHovered(null); } }}>
                <strong>{entry.name}</strong>
                {entry.height >= 42 && <span>{timeLabel(entry.start)}–{timeLabel(entry.end)}</span>}
                {entry.height >= 70 && entry.grades?.length ? <small>Grades {entry.grades.join(', ')}</small> : null}
              </button>
            </li>;
          })}
        </ol>
        <div className="schedule-timeline-axis" aria-label="Time of day">
          {timeline.ticks.filter(minute => minute % 60 === 0).map(minute => <span key={minute} className={minute % 60 === 0 ? 'is-hour' : undefined} style={{ top: (minute - timeline.start) * PIXELS_PER_MINUTE }}>{timeLabel(minute)}</span>)}
        </div>
      </div>
    </div>
  </div>;
}
