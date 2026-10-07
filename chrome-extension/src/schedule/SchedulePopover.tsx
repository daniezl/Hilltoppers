import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DateTime } from 'luxon';
import ScheduleTimeline from './ScheduleTimeline';
import ScheduleNotice from './ScheduleNotice';
import { loadScheduleByType, type SpecialDayRecord } from '../services/scheduleService';

type Blocks = NonNullable<SpecialDayRecord['schedule']>;
type Props = {
  date: DateTime;
  anchor: HTMLButtonElement;
  status: 'special' | 'pending' | 'normal' | 'off';
  label: string;
  name: string;
  record?: SpecialDayRecord;
  customValid: boolean;
  typeAvailable: boolean;
  onClose: () => void;
};
export default function SchedulePopover({ date, anchor, status, label, name, record, customValid, typeAvailable, onClose }: Props) {
  const shell = useRef<HTMLDialogElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const origin = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [result, setResult] = useState<{ blocks: Blocks; error?: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [detailsEnabled, setDetailsEnabled] = useState(false);
  const flight = useRef<Animation[]>([]);
  const closing = useRef(false);
  const dismiss = () => {
    if (closing.current) return;
    closing.current = true;
    setDetailsEnabled(false);
    // Reverse the running animation too, so an early close never jumps to the end.
    const animations = flight.current;
    animations.forEach(animation => {
      animation.updatePlaybackRate(2);
      animation.reverse();
    });
    Promise.all(animations.map(animation => animation.finished)).then(() => {
      onClose();
      anchor.focus({ preventScroll: true });
    }).catch(() => { /* Unmounting cancels animations and already removes the card. */ });
  };

  useLayoutEffect(() => {
    const dialog = shell.current;
    const surface = card.current;
    if (!dialog || !surface) return;
    const place = () => {
      const from = anchor.getBoundingClientRect();
      const width = dialog.offsetWidth;
      const gap = 12;
      const calendar = anchor.closest('.admin-calendar-card')?.getBoundingClientRect();
      let topEdge = Math.max(gap, calendar?.top ?? gap);
      let bottomEdge = Math.min(window.innerHeight - gap, calendar?.bottom ?? window.innerHeight - gap);
      // Keep the card usable if the calendar has scrolled entirely out of view.
      if (bottomEdge <= topEdge) {
        topEdge = gap;
        bottomEdge = window.innerHeight - gap;
      }
      const preferredHeight = status === 'off' && content.current ? content.current.scrollHeight + 2 : 760;
      const height = Math.max(1, Math.min(preferredHeight, bottomEdge - topEdge));
      dialog.style.height = `${height}px`;
      const fitsRight = from.right + gap + width <= window.innerWidth - gap;
      const fitsLeft = from.left - gap - width >= gap;
      const left = fitsRight ? from.right + gap : fitsLeft ? from.left - gap - width : from.left;
      const center = calendar ? (calendar.top + calendar.bottom) / 2 : window.innerHeight / 2;
      const preferredTop = status === 'off' ? from.top : center - height / 2;
      const top = Math.max(topEdge, Math.min(preferredTop, bottomEdge - height));
      dialog.style.left = `${Math.max(gap, Math.min(left, window.innerWidth - width - gap))}px`;
      dialog.style.top = `${top}px`;
    };
    dialog.showModal();
    place();
    closeButton.current?.focus({ preventScroll: true });
    const frames = (): Keyframe[] => {
      const from = anchor.getBoundingClientRect();
      const to = dialog.getBoundingClientRect();
      const dx = from.left + from.width / 2 - to.left - to.width / 2;
      const dy = from.top + from.height / 2 - to.top - to.height / 2;
      return [
        { transform: `translate(${dx}px, ${dy}px) scale(${from.width / to.width}, ${from.height / to.height}) rotateY(0deg)`, background: getComputedStyle(anchor).backgroundColor, borderRadius: '10px', offset: 0 },
        { transform: `translate(${dx * .3}px, ${dy * .3}px) scale(.78) rotateY(180deg)`, offset: .5 },
        { transform: 'translate(0, 0) scale(1) rotateY(360deg)', background: getComputedStyle(dialog).getPropertyValue('--surface').trim(), borderRadius: '16px', offset: 1 }
      ];
    };
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animations: Animation[] = [];
    if (reduced) {
      if (origin.current) origin.current.hidden = true;
      animations.push(surface.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, fill: 'both' }));
    } else {
      const timing: KeyframeAnimationOptions = { duration: 800, easing: 'cubic-bezier(.22,.65,.25,1)', fill: 'both' };
      animations.push(surface.animate(frames(), timing));
      if (origin.current) {
        const face = origin.current;
        face.hidden = false;
        const flip = face.animate([{ opacity: 1, offset: 0 }, { opacity: 1, offset: .3 }, { opacity: 0, offset: .52 }, { opacity: 0, offset: 1 }], timing);
        animations.push(flip);
      }
      if (content.current) animations.push(content.current.animate([
        { opacity: 0, offset: 0 }, { opacity: 0, offset: .38 }, { opacity: 1, offset: .72 }, { opacity: 1, offset: 1 }
      ], timing));
    }
    flight.current = animations;
    let disposed = false;
    setDetailsEnabled(false);
    Promise.all(animations.map(animation => animation.finished)).then(() => {
      if (!disposed && !closing.current) setDetailsEnabled(true);
    }).catch(() => { /* Cancelled animations must not enable hover details. */ });
    const reposition = () => {
      place();
      if (!reduced) (animations[0].effect as KeyframeEffect).setKeyframes(frames());
    };
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      disposed = true;
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      animations.forEach(animation => animation.cancel());
      flight.current = [];
      dialog.close();
    };
  }, [anchor]);

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    if (status === 'off') return;
    if (record?.type === 'custom') {
      setResult({ blocks: customValid ? record.schedule! : [] });
      return;
    }
    const weekday = date.weekday;
    const regular = weekday === 3 ? 'schedule_wed' : weekday === 5 ? 'schedule_fri' : weekday < 6 ? 'schedule_mon_thu' : null;
    const type = typeAvailable ? record?.type : regular;
    if (!type) { setResult({ blocks: [] }); return; }
    loadScheduleByType(type).then(blocks => {
      if (!cancelled) setResult({ blocks: blocks ?? [], error: blocks === null });
    }).catch(() => { if (!cancelled) setResult({ blocks: [], error: true }); });
    return () => { cancelled = true; };
  }, [date, status, record, customValid, typeAvailable, attempt]);

  return <dialog ref={shell} data-schedule-status={status} className={`schedule-popover-shell${status === 'off' ? ' is-no-school' : ''}`} aria-labelledby="schedule-popover-title" id="schedule-popover"
    onCancel={event => { event.preventDefault(); dismiss(); }}
    onClick={event => { if (event.target === event.currentTarget) dismiss(); }}>
    <div ref={card} className="schedule-popover">
      <div ref={origin} className={`schedule-popover-origin admin-calendar-${status}`} aria-hidden="true"><strong>{date.day}</strong>{name && <span>{name}</span>}</div>
      <div ref={content} className="schedule-popover-content">
      <header>
        <button ref={closeButton} type="button" className="schedule-popover-close" aria-label="Close schedule" onClick={dismiss}>×</button>
        <p className="schedule-popover-weekday">{date.setLocale('en-US').toFormat('cccc')}</p>
        <div className="schedule-popover-heading">
          <h2 id="schedule-popover-title">{date.setLocale('en-US').toFormat('MMMM d, yyyy')}</h2>
          <span className="schedule-popover-label-group">
          <span className={`schedule-popover-status admin-calendar-${status === 'pending' ? 'normal' : status}`}>{status === 'normal' || status === 'pending' ? `${date.setLocale('en-US').toFormat('cccc')} schedule` : name || (status === 'off' && date.weekday > 5 ? 'Weekend' : label)}</span>
          {status === 'pending' && <ScheduleNotice name={name} enabled={detailsEnabled} />}
          </span>
        </div>
      </header>
      {status !== 'off' && <>
        {!result ? <p role="status" className="schedule-popover-empty">Loading schedule…</p> : result.error ?
          <div role="alert" className="schedule-popover-empty"><p>Couldn't load the schedule.</p><button type="button" onClick={() => setAttempt(a => a + 1)}>Try again</button></div> : !result.blocks.length ?
          <p className="schedule-popover-empty">No timetable available yet.</p> :
          <ScheduleTimeline blocks={result.blocks} detailsEnabled={detailsEnabled} />}
      </>}
      </div>
    </div>
  </dialog>;
}
