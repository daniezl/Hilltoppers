import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { loadScheduleByType } from '../services/scheduleService';
import ScheduleTimeline from './ScheduleTimeline';
import type { TimelineBlock } from './timelineLayout';

const presets = [
  { type: 'schedule_mon_thu', name: 'Mon–Thurs / Wednesday', color: 'gray' },
  { type: 'schedule_fri', name: 'Friday', color: 'green' },
  { type: 'late_start', name: 'Late start', color: 'yellow' },
  { type: 'abdec', name: 'ABDEC', color: 'red' }
];

type Props = { onBack: () => void; anchor: HTMLButtonElement };
export default function PresetSchedules({ onBack, anchor }: Props) {
  const shell = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const flight = useRef<Animation | null>(null);
  const closing = useRef(false);
  const [ready, setReady] = useState(false);
  const dismiss = () => {
    if (closing.current) return;
    closing.current = true;
    setReady(false);
    const finish = () => { onBack(); anchor.focus({ preventScroll: true }); };
    const animation = flight.current;
    if (!animation) { finish(); return; }
    animation.updatePlaybackRate(2);
    animation.reverse();
    animation.finished.then(finish).catch(() => {});
  };
  const [schedules, setSchedules] = useState<TimelineBlock[][] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setSchedules(null);
    Promise.all(presets.map(preset => loadScheduleByType(preset.type))).then(results => {
      if (cancelled) return;
      if (results.some(blocks => !blocks?.length)) { setFailed(true); return; }
      setSchedules(results.map((blocks, index) => blocks!.map(block =>
        index === 0 && block.name === 'Chapel' ? { ...block, name: 'Chapel / Advisory' } : block
      )));
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [attempt]);
  useLayoutEffect(() => {
    const dialog = shell.current;
    const surface = panel.current;
    if (!dialog || !surface) return;
    const place = () => {
      const calendar = anchor.closest('.admin-calendar')!.querySelector('.admin-calendar-card')!.getBoundingClientRect();
      let topEdge = Math.max(12, calendar.top);
      let bottomEdge = Math.min(window.innerHeight - 12, calendar.bottom);
      if (bottomEdge <= topEdge) { topEdge = 12; bottomEdge = window.innerHeight - 12; }
      const height = Math.max(1, Math.min(760, bottomEdge - topEdge));
      dialog.style.height = `${height}px`;
      dialog.style.top = `${Math.max(topEdge, Math.min((calendar.top + calendar.bottom - height) / 2, bottomEdge - height))}px`;
      dialog.style.left = `${Math.max(12, Math.min((calendar.left + calendar.right - dialog.offsetWidth) / 2, window.innerWidth - dialog.offsetWidth - 12))}px`;
    };
    const frames: Keyframe[] = [
      { transform: 'translateY(-28px)', opacity: 0 },
      { transform: 'translateY(0)', opacity: 1 }
    ];
    dialog.showModal();
    place();
    closeButton.current?.focus({ preventScroll: true });
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animation = surface.animate(reduced ? [{ opacity: 0 }, { opacity: 1 }] : frames,
      { duration: reduced ? 120 : 320, easing: 'cubic-bezier(.22,.65,.25,1)', fill: 'both' });
    flight.current = animation;
    let disposed = false;
    animation.finished.then(() => { if (!disposed && !closing.current) setReady(true); }).catch(() => {});
    const reposition = place;
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      disposed = true;
      animation.cancel();
      flight.current = null;
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      dialog.close();
    };
  }, [anchor]);
  return <dialog ref={shell} className="schedule-popover-shell schedule-presets-dialog" aria-labelledby="preset-schedules-title"
    onCancel={event => { event.preventDefault(); dismiss(); }}
    onClick={event => { if (event.target === event.currentTarget) dismiss(); }}>
    <div ref={panel} className="schedule-popover">
      <div className="schedule-popover-content">
        <header className="schedule-presets-heading">
          <h2 id="preset-schedules-title">All schedules</h2>
          <button ref={closeButton} type="button" className="schedule-popover-close" aria-label="Close all schedules" onClick={dismiss}>×</button>
        </header>
        {failed ? <div className="admin-calendar-message" role="alert"><p>Couldn't load the schedules.</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Try again</button></div> : !schedules ?
          <p className="admin-calendar-message" role="status">Loading schedules…</p> :
          <div className="schedule-presets-scroll" role="region" aria-label="All preset schedules, side by side" tabIndex={0}>
            <div className="schedule-presets-grid">
              {presets.map((preset, index) => <section key={preset.type} className={`schedule-preset schedule-preset-${preset.color}`} aria-label={preset.name}>
                <h3><span>{preset.name}</span></h3>
                <ScheduleTimeline blocks={schedules[index]} detailsEnabled={ready} />
              </section>)}
            </div>
          </div>}
      </div>
    </div>
  </dialog>;
}
