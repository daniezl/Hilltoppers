import React, { useEffect, useRef, useState } from 'react';

const MODULE_ORIGIN = 'http://127.0.0.1:4174';
const CHANNEL = 'hilltoppers-iframe-lab-v1';

function IframeContent() {
  const frame = useRef<HTMLIFrameElement>(null);
  const [session, setSession] = useState(() => crypto.randomUUID());
  const [status, setStatus] = useState('Connecting…');
  const [clicks, setClicks] = useState(0);
  const [height, setHeight] = useState(230);
  const [offline, setOffline] = useState(false);
  const lastReply = useRef(0);

  useEffect(() => {
    lastReply.current = Date.now();
    const receive = (event: MessageEvent) => {
      // A matching origin alone cannot identify which window sent the message.
      if (event.origin !== MODULE_ORIGIN || event.source !== frame.current?.contentWindow) return;
      const data = event.data;
      if (!data || data.channel !== CHANNEL || data.session !== session) return;
      if (data.type === 'ready' || data.type === 'pong') {
        lastReply.current = Date.now();
        setStatus('Connected');
      } else if (data.type === 'click' && Number.isSafeInteger(data.count) && data.count >= 0) {
        setClicks(data.count);
      } else if (data.type === 'resize' && Number.isFinite(data.height)) {
        setHeight(Math.max(180, Math.min(320, data.height)));
      }
    };
    window.addEventListener('message', receive);
    // Retry the handshake because iframe load events do not prove that a module is ready.
    const timer = window.setInterval(() => {
      frame.current?.contentWindow?.postMessage({
        channel: CHANNEL, session, type: 'context', theme: 'light', date: '2026-09-16'
      }, MODULE_ORIGIN);
      if (Date.now() - lastReply.current > 5000) setStatus('Module unavailable — try reloading');
    }, 500);
    return () => { window.removeEventListener('message', receive); window.clearInterval(timer); };
  }, [session]);

  function reload(fail = false) {
    setOffline(fail);
    setSession(crypto.randomUUID());
    setClicks(0);
    setStatus('Connecting…');
  }

  return <div className="iframe-experiment-content" id="iframe-experiment-content">
    <iframe key={session} ref={frame} title="Independent demo module"
      src={`${MODULE_ORIGIN}/${offline ? 'unavailable' : ''}?session=${session}`}
      sandbox="allow-scripts allow-same-origin" referrerPolicy="no-referrer"
      style={{ height }} />
    <div className="iframe-experiment-status"><span role="status">{status}</span><span>{clicks} clicks received</span></div>
    <div className="iframe-experiment-actions">
      <button type="button" onClick={() => reload()}>Reload module</button>
      <button type="button" onClick={() => reload(true)}>Simulate failure</button>
    </div>
  </div>;
}

export default function IframeExperiment() {
  const [expanded, setExpanded] = useState(false);
  return <section className={`iframe-experiment ${expanded ? '' : 'collapsed'}`}>
    <button type="button" className="schedule-toggle" aria-expanded={expanded}
      aria-controls="iframe-experiment-content" onClick={() => setExpanded(value => !value)}>
      <span className="toggle-title">
        <svg className="toggle-title-icon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M3 9h18M8 6.5h.01M5.5 6.5h.01" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span>Iframe experiment</span>
      </span>
      <span className={`chevron ${expanded ? 'open' : ''}`} aria-hidden="true" />
    </button>
    {expanded && <IframeContent />}
  </section>;
}
