import React, { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';

type Props = { monthIndex: number; distance: number; children: ReactNode };

export default function MonthStack({ monthIndex, distance, children }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const front = useRef<HTMLDivElement>(null);
  const previous = useRef<{ month: number; page: HTMLElement } | null>(null);
  const stop = useRef<(() => void) | null>(null);
  const layers = Math.min(Math.abs(distance), 5);
  const direction = distance < 0 ? -1 : 1;

  useLayoutEffect(() => {
    const root = host.current;
    const page = front.current?.firstElementChild as HTMLElement | null;
    if (!root || !page) return;
    const old = previous.current;
    const snapshot = page.cloneNode(true) as HTMLElement;
    snapshot.style.removeProperty('transform');
    snapshot.style.removeProperty('opacity');
    previous.current = { month: monthIndex, page: snapshot };
    if (!old || old.month === monthIndex) return;
    stop.current?.();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // The outgoing copy is visual only; the current month's controls retain focus and remain usable.
    const outgoing = old.page;
    outgoing.classList.add('calendar-month-outgoing');
    outgoing.setAttribute('aria-hidden', 'true');
    outgoing.setAttribute('inert', '');
    outgoing.removeAttribute('id');
    outgoing.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
    root.appendChild(outgoing);
    const turn = monthIndex > old.month ? 1 : -1;
    outgoing.style.transformOrigin = 'center bottom';
    const slide = Math.min(page.offsetWidth * .3, 220) * turn;
    const sidePose = `translate(${slide}px, -12px) rotate(${turn * 6}deg)`;
    const backPose = `translate(${direction * layers * 5}px, ${layers * -5}px) rotate(${direction * layers * 1.2}deg)`;
    const animations: Animation[] = [];
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      animations.forEach(animation => animation.cancel());
      outgoing.remove();
    };
    stop.current = cleanup;
    const pull = outgoing.animate([
      { transform: 'translate(0, 0) rotate(0deg)' },
      { transform: sidePose }
    ], { duration: 280, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
    animations.push(pull);
    animations.push(page.animate([
      { transform: 'translateY(5px) scale(.985)' },
      { transform: 'translateY(0) scale(1)' }
    ], { duration: 600, easing: 'cubic-bezier(.22,.65,.25,1)' }));
    pull.finished.then(() => {
      if (cleaned) return;
      // Change stacking only at the outside edge, then slide the face-up card behind the new month.
      outgoing.style.zIndex = '0';
      const tuck = outgoing.animate([
        { transform: sidePose },
        { transform: backPose, height: `${page.offsetHeight}px` }
      ], { duration: 360, easing: 'cubic-bezier(.22,.65,.25,1)', fill: 'forwards' });
      animations.push(tuck);
      tuck.finished.then(cleanup).catch(() => {});
    }).catch(() => {});
  });
  useEffect(() => () => stop.current?.(), []);

  return <div ref={host} className="calendar-month-stack" style={{ marginTop: layers ? 18 : 0 }}>
    {Array.from({ length: layers }, (_, index) => {
      const depth = layers - index;
      return <div key={depth} className="calendar-month-layer" aria-hidden="true" style={{
        transform: `translate(${direction * depth * 5}px, ${depth * -5}px) rotate(${direction * depth * 1.2}deg)`, zIndex: -depth
      }} />;
    })}
    <div ref={front} className="calendar-month-front">{children}</div>
  </div>;
}
