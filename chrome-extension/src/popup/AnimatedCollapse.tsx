import { useLayoutEffect, useRef, type ReactNode } from 'react';

export default function AnimatedCollapse({ expanded, children }: { expanded: boolean; children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const opened = useRef(false);
  if (expanded) opened.current = true;

  useLayoutEffect(() => {
    const container = outer.current!;
    const content = inner.current!;
    container.inert = !expanded;
    const resize = () => {
      const height = expanded ? content.getBoundingClientRect().height : 0;
      // Measure the current frame before assigning the next transition target.
      container.getBoundingClientRect();
      container.dataset.expandHeight = String(height);
      container.style.height = `${height}px`;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(content);
    return () => observer.disconnect();
  }, [expanded]);

  return <div ref={outer} className={`module-collapse${expanded ? ' is-open' : ''}`} aria-hidden={!expanded}>
    <div ref={inner} className="module-collapse-inner">{opened.current ? children : null}</div>
  </div>;
}
