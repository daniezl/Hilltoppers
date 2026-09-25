import { useEffect, useRef } from 'react';

export function useRevealExpandedSection<T extends HTMLElement = HTMLElement>(expanded: boolean, selected?: string | null) {
  const section = useRef<T>(null);

  useEffect(() => {
    if (!expanded) return;
    let frame = 0;
    let stopped = false;
    const stop = () => { stopped = true; cancelAnimationFrame(frame); };
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const start = performance.now();
    const initialScroll = window.scrollY;
    const reveal = (time: number) => {
      if (stopped || !section.current) return;
      const bounds = section.current.getBoundingClientRect();
      const content = section.current.querySelector<HTMLElement>('.module-collapse');
      const targetHeight = bounds.height + (content ? Number(content.dataset.expandHeight || 0) - content.getBoundingClientRect().height : 0);
      const top = bounds.top + window.scrollY;
      const viewport = document.documentElement.clientHeight;
      const target = targetHeight > viewport - 24 || top - initialScroll < 12
        ? top - 12
        : Math.max(initialScroll, top + targetHeight - viewport + 12);
      const progress = reduced ? 1 : Math.min(1, (time - start) / 240);
      const ease = 1 - Math.pow(1 - progress, 3);
      window.scrollTo({ top: initialScroll + (target - initialScroll) * ease, behavior: 'instant' });
      if (progress < 1) frame = requestAnimationFrame(reveal);
    };
    frame = requestAnimationFrame(reveal);
    window.addEventListener('wheel', stop, { passive: true });
    window.addEventListener('touchstart', stop, { passive: true });
    return () => {
      stop();
      window.removeEventListener('wheel', stop);
      window.removeEventListener('touchstart', stop);
    };
  }, [expanded, selected]);

  return section;
}
