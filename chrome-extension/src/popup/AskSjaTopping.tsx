import React, { useEffect, useRef, useState } from 'react';
import { useRevealExpandedSection } from './useRevealExpandedSection';

const TOPPING_URL = import.meta.env.VITE_ASK_SJA_TOPPING_URL || 'https://ask-sja-topping.danielzhang089.workers.dev/';
const CHANNEL = 'hilltoppers-topping-v1';
const PREFERENCE = 'askSjaToppingEnabled';

function ToppingFrame() {
  const frame = useRef<HTMLIFrameElement>(null);
  const [session, setSession] = useState(() => crypto.randomUUID());
  const [unavailable, setUnavailable] = useState(false);
  const source = new URL(TOPPING_URL);
  source.searchParams.set('session', session);
  source.searchParams.set('host', window.location.origin);
  const origin = source.origin;

  useEffect(() => {
    let lastReply = Date.now();
    const receive = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== frame.current?.contentWindow) return;
      const data = event.data;
      if (data?.channel === CHANNEL && data.session === session && data.type === 'ready') {
        lastReply = Date.now();
        setUnavailable(false);
      }
    };
    const connect = () => {
      frame.current?.contentWindow?.postMessage({ channel: CHANNEL, session, type: 'context' }, origin);
      if (Date.now() - lastReply > 12000) setUnavailable(true);
    };
    window.addEventListener('message', receive);
    const timer = window.setInterval(connect, 1500);
    connect();
    return () => { window.removeEventListener('message', receive); window.clearInterval(timer); };
  }, [session, origin]);

  return <div id="ask-sja-content" className="topping-content">
    <iframe ref={frame} src={source.href} title="Ask SJA topping"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer" />
    {unavailable && <div className="topping-unavailable" role="alert">
      <p>Ask SJA could not be reached.</p>
      <button type="button" onClick={() => { setSession(crypto.randomUUID()); setUnavailable(false); }}>Try again</button>
    </div>}
  </div>;
}

export default function AskSjaTopping() {
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [expanded, setExpanded] = useState(false);
  const section = useRevealExpandedSection(expanded);
  const [revision, setRevision] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node)) setMenuOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', escape); };
  }, []);
  useEffect(() => {
    let alive = true;
    if (typeof chrome === 'undefined' || !chrome.storage?.local) { setInstalled(false); return; }
    chrome.storage.local.get(PREFERENCE).then(value => {
      if (alive) setInstalled(value[PREFERENCE] === true);
    }).catch(() => { if (alive) setInstalled(false); });
    return () => { alive = false; };
  }, []);

  function choose(value: boolean) {
    setMenuOpen(false);
    setInstalled(value);
    setExpanded(value);
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      void chrome.storage.local.set({ [PREFERENCE]: value }).catch(() => {});
    }
  }

  if (installed === null) return null;
  if (!installed) return <div className="topping-add">
    <button type="button" onClick={() => choose(true)}>＋ Add Ask SJA topping</button>
  </div>;
  return <section ref={section} className={`topping-section ${expanded ? '' : 'collapsed'}`}>
    <div className="topping-heading">
    <button type="button" className="schedule-toggle" aria-expanded={expanded}
      aria-controls="ask-sja-content" onClick={() => setExpanded(value => !value)}>
      <span className="toggle-title">
        <svg className="toggle-title-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 3v-3H3V6a2 2 0 0 1 2-2ZM8 9h8M8 13h5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>Ask SJA</span>
      </span>
      <span className={`chevron ${expanded ? 'open' : ''}`} aria-hidden="true" />
    </button>
    <div className="topping-menu" ref={menu}>
      <button type="button" className="topping-menu-toggle" aria-label="Topping options" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}>⋯</button>
      {menuOpen && <div className="topping-menu-items">
        <a href={TOPPING_URL} target="_blank" rel="noopener noreferrer" onClick={() => setMenuOpen(false)}>Open website ↗</a>
        <button type="button" onClick={() => { setRevision(value => value + 1); setExpanded(true); setMenuOpen(false); }}>Reload</button>
        <button type="button" onClick={() => choose(false)}>Remove topping</button>
      </div>}
    </div>
    </div>
    {expanded && <ToppingFrame key={revision} />}
  </section>;
}
