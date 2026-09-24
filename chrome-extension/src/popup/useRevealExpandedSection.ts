import { useEffect, useRef } from 'react';

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
        const delta = bounds.height > height - margin * 2 || bounds.top < margin
          ? bounds.top - margin
          : Math.max(0, bounds.bottom - height + margin);
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
