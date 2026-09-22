import ToppingIcon from '../toppings/ToppingIcon';
import React, { useEffect, useRef, useState } from 'react';
import { changeTopping, localToppings, fetchToppings, openToppingBar, PREVIEW_TOPPING_KEY, TOPPINGS_KEY, type Topping } from '../services/toppingsService';
import { useRevealExpandedSection } from './useRevealExpandedSection';

const CHANNEL = 'hilltoppers-topping-v1';

function ToppingFrame({ topping }: { topping: Topping }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [session, setSession] = useState(() => crypto.randomUUID());
  const [unavailable, setUnavailable] = useState(false);
  const source = new URL(topping.url);
  source.searchParams.set('session', session);
  source.searchParams.set('host', window.location.origin);
  const origin = source.origin;

  useEffect(() => {
    if (topping.preview) return;
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
  }, [session, origin, topping.preview]);

  return <div id={`topping-${topping.id}`} className="topping-content">
    <iframe ref={frame} src={source.href} title={`${topping.name} topping`}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer" />
    {!topping.preview && unavailable && <div className="topping-unavailable" role="alert">
      <p>{topping.name} could not be reached.</p>
      <button type="button" onClick={() => { setSession(crypto.randomUUID()); setUnavailable(false); }}>Try again</button>
    </div>}
  </div>;
}

function ToppingSection({ topping }: { topping: Topping }) {
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState(false);
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
  async function remove() {
    setRemoving(true);setError('');
    try { await changeTopping(topping, false); }
    catch(e) { setError(e instanceof Error ? e.message : 'Could not remove Topping.'); }
    finally { setRemoving(false); }
  }
  return <section ref={section} className={`topping-section ${expanded ? '' : 'collapsed'}`}>
    <div className="topping-heading">
    <button type="button" className="schedule-toggle" aria-expanded={expanded}
      aria-controls={`topping-${topping.id}`} onClick={() => setExpanded(value => !value)}>
      <span className="toggle-title">
        <ToppingIcon className="toggle-title-icon" icon={topping.icon || (topping.id === 'ask-sja' ? 'chat' : 'sparkle')}/>
        <span>{topping.name}</span>
        {topping.preview && <span className="topping-preview-badge">Preview</span>}
      </span>
      <span className={`chevron ${expanded ? 'open' : ''}`} aria-hidden="true" />
    </button>
    <div className="topping-menu" ref={menu}>
      <button type="button" className="topping-menu-toggle" aria-label="Topping options" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}>⋯</button>
      {menuOpen && <div className="topping-menu-items">
        <a href={topping.url} target="_blank" rel="noopener noreferrer" onClick={() => setMenuOpen(false)}>Open website ↗</a>
        <button type="button" onClick={() => { setRevision(value => value + 1); setExpanded(true); setMenuOpen(false); }}>Reload</button>
        <button type="button" disabled={removing} onClick={() => void remove()}>Remove topping</button>
      </div>}
    </div>
    </div>
    {error && <p role="alert">{error} <button onClick={openToppingBar}>Open Topping Bar</button></p>}
    {expanded && <ToppingFrame key={revision} topping={topping} />}
  </section>;
}


export default function InstalledToppings() {
  const [items, setItems] = useState<Topping[]>([]);
  useEffect(() => {
    let alive = true;
    const read = () => { void localToppings().then(list => { if (alive) setItems(list); }).catch(() => {}); };
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if ((area === 'local' && (changes[TOPPINGS_KEY] || changes.askSjaToppingEnabled)) ||
          (area === 'session' && changes[PREVIEW_TOPPING_KEY])) read();
    };
    read(); chrome.storage.onChanged.addListener(changed);
    // Withdrawn listings stop loading; an offline catalog does not erase installed modules.
    void fetchToppings().then(async catalog => {
      const local = await localToppings();
      if (!alive) return;
      await chrome.storage.local.set({ [TOPPINGS_KEY]: local.filter(t => !t.preview).flatMap(t => {
        const current = catalog.find(x => x.id === t.id); return current ? [current] : [];
      }) });
    }).catch(() => {});
    return () => { alive = false; chrome.storage.onChanged.removeListener(changed); };
  }, []);
  return <>{items.map(t=><ToppingSection key={t.id} topping={t} />)}</>;
}
