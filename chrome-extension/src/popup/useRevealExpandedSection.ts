import { useEffect, useRef } from 'react';

const REVEAL_THRESHOLD_PX = 24;

export function useRevealExpandedSection(expanded: boolean) {
  const section = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!expanded) return;
    let frame = requestAnimationFrame(() => {
      // Let the expanded layout and popup viewport settle before measuring.
      frame = requestAnimationFrame(() => {
        if (!section.current) return;
        const bounds = section.current.getBoundingClientRect();
        const margin = 12;
        const height = document.documentElement.clientHeight;
        // Measure actual clipping, excluding the breathing room added after scrolling.
        const clipped = Math.max(0, bounds.bottom - height, -bounds.top);
        if (clipped <= REVEAL_THRESHOLD_PX) return;
        const delta = bounds.height > height - margin * 2 || bounds.top < margin
          ? bounds.top - margin
          : Math.max(0, bounds.bottom - height + margin);
        if (Math.abs(delta) < 1) return;
        window.scrollBy({
          top: delta,
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
        });
      });
    });
    // Only opening triggers a reveal; later content updates must not steal scroll.
    return () => cancelAnimationFrame(frame);
  }, [expanded]);

  return section;
}
