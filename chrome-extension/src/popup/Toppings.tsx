import ToppingIcon from '../toppings/ToppingIcon';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { changeTopping, localToppings, fetchToppings, openToppingBar, PREVIEW_TOPPING_KEY, TOPPINGS_KEY, TOPPING_ORDER_KEY, type Topping } from '../services/toppingsService';
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

function ToppingSection({ topping, expanded }: { topping: Topping; expanded: boolean }) {
  const section = useRevealExpandedSection(expanded);
  return <section ref={section} hidden={!expanded} className="topping-section topping-panel" aria-label={topping.name}>
    <ToppingFrame topping={topping}/>
  </section>;
}


export default function InstalledToppings() {
  const [items, setItems] = useState<Topping[]>([]);
  const [tooltip,setTooltip]=useState<{name:string;x:number;y:number}|null>(null);
  const tooltipElement=useRef<HTMLSpanElement>(null);
  useLayoutEffect(()=>{
    if(!tooltip||!tooltipElement.current)return;
    const half=tooltipElement.current.getBoundingClientRect().width/2;
    const x=Math.max(half+8,Math.min(window.innerWidth-half-8,tooltip.x));
    if(x!==tooltip.x)setTooltip({...tooltip,x});
  },[tooltip]);
  function showName(button:HTMLButtonElement,name:string) {
    const bounds=button.getBoundingClientRect();
    setTooltip({name,x:bounds.left+bounds.width/2,y:bounds.top-7});
  }
  const [activeId,setActiveId]=useState<string|null>(null);
  const [menuOpen,setMenuOpen]=useState(false);
  const [removing,setRemoving]=useState(false);
  const [error,setError]=useState('');
  const [revisions,setRevisions]=useState<Record<string,number>>({});
  const menu=useRef<HTMLDivElement>(null);
  const active=items.find(t=>t.id===activeId);
  useEffect(()=>{setMenuOpen(false);setError('');},[activeId]);
  useEffect(()=>{
    const close=(event:PointerEvent)=>{if(!menu.current?.contains(event.target as Node))setMenuOpen(false);};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setMenuOpen(false);setTooltip(null);}};
    window.addEventListener('pointerdown',close);window.addEventListener('keydown',escape);
    return()=>{window.removeEventListener('pointerdown',close);window.removeEventListener('keydown',escape);};
  },[]);
  async function removeActive(){
    if(!active)return;
    setRemoving(true);setError('');
    try{await changeTopping(active,false);setMenuOpen(false);}catch(e){setError(e instanceof Error?e.message:'Could not remove Topping.');}finally{setRemoving(false);}
  }
  const [opened,setOpened]=useState<Set<string>>(()=>new Set());
  function toggle(topping:Topping) {
    setTooltip(null);
    setActiveId(current=>current===topping.id?null:topping.id);
    setOpened(current=>new Set(current).add(topping.id));
  }
  useEffect(()=>{if(activeId&&!items.some(t=>t.id===activeId))setActiveId(null);},[items,activeId]);
  useEffect(() => {
    let alive = true;
    const read = () => { void localToppings().then(list => { if (alive) setItems(list); }).catch(() => {}); };
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if ((area === 'local' && (changes[TOPPINGS_KEY] || changes[TOPPING_ORDER_KEY] || changes.askSjaToppingEnabled)) ||
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
  return <div className="toppings-dock">
    <div className="toppings-row">
    <div className="toppings-strip" role="group" aria-label="Your Toppings">
      <div className="toppings-strip-scroll" onScroll={()=>setTooltip(null)}>
        {items.map(t=><button key={t.id} type="button" className="topping-chip" onMouseEnter={e=>showName(e.currentTarget,t.name)} onMouseLeave={()=>setTooltip(null)} onFocus={e=>showName(e.currentTarget,t.name)} onBlur={()=>setTooltip(null)} aria-label={t.name} aria-expanded={activeId===t.id} aria-controls={`topping-${t.id}`} onClick={()=>toggle(t)}>
          <ToppingIcon icon={t.icon||(t.id==='ask-sja'?'chat':'sparkle')}/>
        </button>)}
      </div>
      {items.length>0&&<span className="toppings-divider" aria-hidden="true"/>}
      <button type="button" className="toppings-add" aria-label="Add a Topping" onMouseEnter={e=>showName(e.currentTarget,'Add a Topping')} onMouseLeave={()=>setTooltip(null)} onFocus={e=>showName(e.currentTarget,'Add a Topping')} onBlur={()=>setTooltip(null)} onClick={()=>{setTooltip(null);openToppingBar();}}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>
    </div>
    {active&&<div className="topping-menu" ref={menu}>
      <button type="button" className="topping-menu-toggle" aria-label="Topping options" aria-expanded={menuOpen} onClick={()=>{setTooltip(null);setMenuOpen(value=>!value);}}>⋯</button>
      {menuOpen&&active&&<div className="topping-menu-items">
        <a href={active.url} target="_blank" rel="noopener noreferrer" onClick={()=>setMenuOpen(false)}>Open website ↗</a>
        <button type="button" onClick={()=>{setRevisions(current=>({...current,[active.id]:(current[active.id]||0)+1}));setMenuOpen(false);}}>Reload</button>
        <button type="button" disabled={removing} onClick={()=>void removeActive()}>Remove topping</button>
      </div>}
    </div>}
    </div>
    {error&&<p role="alert">{error}</p>}
    {tooltip&&<span ref={tooltipElement} role="tooltip" className="topping-name-tooltip" style={{left:tooltip.x,top:tooltip.y}}>{tooltip.name}</span>}
    {items.filter(t=>opened.has(t.id)).map(t=><ToppingSection key={`${t.id}-${revisions[t.id]||0}`} topping={t} expanded={activeId===t.id}/>)}
  </div>;
}
