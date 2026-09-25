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
      // An outer accordion follows the inner accordion's final height, not each
      // intermediate frame, so nested transitions finish together.
      const nested = Array.from(content.querySelectorAll<HTMLElement>('.module-collapse'))
        .filter(node => node.parentElement?.closest('.module-collapse') === container);
      const adjustment = nested.reduce((sum, node) => sum + Number(node.dataset.expandHeight || 0) - node.getBoundingClientRect().height, 0);
      const height = expanded ? content.getBoundingClientRect().height + adjustment : 0;
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
