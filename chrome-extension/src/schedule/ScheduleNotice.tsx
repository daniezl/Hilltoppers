import React, { useEffect, useId, useState } from 'react';

export function ScheduleWarningIcon() {
  return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10.3 4.2 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z"/>
        <path d="M12 9v4M12 17h.01"/>
      </svg>);
}

export default function ScheduleNotice({ name, enabled }: { name: string; enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  useEffect(() => { if (!enabled) setOpen(false); }, [enabled]);
  return <span className="schedule-notice" onMouseLeave={() => setOpen(false)}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button type="button" className="schedule-notice-trigger" aria-label="Possible schedule change details"
      aria-describedby={enabled && open ? id : undefined} disabled={!enabled}
      onMouseMove={() => { if (enabled) setOpen(true); }}
      onFocus={event => { if (enabled && event.currentTarget.matches(':focus-visible')) setOpen(true); }}
      onClick={() => setOpen(value => !value)}
      onKeyDown={event => { if (event.key === 'Escape' && open) { event.stopPropagation(); setOpen(false); } }}>
      <ScheduleWarningIcon />
    </button>
    {enabled && open && <span className="schedule-notice-tooltip" role="tooltip" id={id}>
      <strong>{name || 'Potential special schedule'}</strong>
      <span>This date may have a special schedule. A confirmed timetable is not available yet.</span>
    </span>}
  </span>;
}
