import React, { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthState, getSchoolEmail, isSchoolEmail, type AuthUser } from '../firebase/auth';
import { changeTopping, fetchToppings, toppingRequest, TOPPINGS_KEY, localToppings, savePreviewTopping, type Topping } from '../services/toppingsService';
import './toppings.css';
import ToppingGuide from './ToppingGuide';
import ToppingInstallButton from './ToppingInstallButton';
import ToppingIcon, { TOPPING_ICONS } from './ToppingIcon';
import PreviewImageInput from './PreviewImageInput';
import ToppingSubmissions from './ToppingSubmissions';
import InstalledToppingManager from './InstalledToppingManager';
import OwnToppingSubmissions from './OwnToppingSubmissions';

export default function ToppingBar({ onAccount, active = true }: { onAccount?: () => void; active?: boolean }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accountReady, setAccountReady] = useState(false);
  const [selectedIcon,setSelectedIcon] = useState('');
  const [imageData,setImageData]=useState('');
  const [editingId,setEditingId]=useState<string|null>(null);
  const [publishDraft,setPublishDraft]=useState({name:'',description:'',url:''});
  const [reviewing,setReviewing]=useState(false);
  const [canReview,setCanReview]=useState(false);
  const scrollSpace=useRef<HTMLDivElement>(null);
  const installAnchor=useRef<{button:HTMLButtonElement;top:number}|null>(null);
  const keepInstallPosition=useCallback(()=>{
    const anchor=installAnchor.current;
    if(!anchor?.button.isConnected)return;
    const delta=anchor.button.getBoundingClientRect().top-anchor.top;
    if(Math.abs(delta)<=0.5)return;
    const spacer=scrollSpace.current;
    const destination=Math.max(0,window.scrollY+delta);
    // Short pages need real scroll range before the browser can hold the button still.
    if(spacer&&destination>document.documentElement.scrollHeight-document.documentElement.clientHeight){
      const spacerTop=spacer.getBoundingClientRect().top+window.scrollY;
      spacer.style.height=`${Math.max(spacer.offsetHeight,destination+document.documentElement.clientHeight-spacerTop+1)}px`;
    }
    window.scrollTo({top:destination,behavior:'instant'});
    if(spacer&&window.scrollY<0.5)spacer.style.height='0px';
  },[]);
  const ranking=useRef(new Map<string,{users:number;createdAt:number}>());
  function acceptList(list:Topping[]) {
    for(const t of list) if(!ranking.current.has(t.id)) ranking.current.set(t.id,{users:t.users,createdAt:t.createdAt});
    setItems(list);
  }
  const [items, setItems] = useState<Topping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const noteTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => () => { noteTimers.current.forEach(clearTimeout); }, []);
  function notify(key: string, text: string, duration = 4000) {
    clearTimeout(noteTimers.current.get(key));
    setNotes(current => ({ ...current, [key]: text }));
    noteTimers.current.set(key, setTimeout(() => {
      setNotes(current => ({ ...current, [key]: '' }));
      noteTimers.current.delete(key);
    }, duration));
  }
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('popular');
  const [readingGuide, setReadingGuide] = useState(false);
  const [creating, setCreating] = useState(false);
  const [previewAdded, setPreviewAdded] = useState(false);
  const [publishing, setPublishing] = useState(() => sessionStorage.getItem('resumeToppingPublish') === 'true');
  useEffect(() => { sessionStorage.removeItem('resumeToppingPublish'); }, []);
  const [detail, setDetail] = useState<Topping | null>(null);
  const [linkedSchool, setLinkedSchool] = useState<string|null>(null);
  useEffect(()=>{
    let alive=true;
    const refresh=()=>{
      setLinkedSchool(null);
      if(user && !isSchoolEmail(user.email))getSchoolEmail(user).then(value=>{if(alive)setLinkedSchool(value.verified?value.email:null);}).catch(()=>{});
    };
    refresh();window.addEventListener('school-email-linked',refresh);
    return ()=>{alive=false;window.removeEventListener('school-email-linked',refresh);};
  },[user?.uid,user?.email,active]);
  const schoolAccount = (!!user?.emailVerified && isSchoolEmail(user.email)) || Boolean(linkedSchool);
  const linkedAuthor = (linkedSchool || (isSchoolEmail(user?.email) ? user?.email : ''))?.split('@')[0].split(/[._-]+/).filter(Boolean).map(part=>part[0].toUpperCase()+part.slice(1)).join(' ');
  const signIn = () => {
    if (onAccount) { onAccount(); return; }
    if (publishing) sessionStorage.setItem('resumeToppingPublish', 'true');
    window.location.href = chrome.runtime.getURL('login.html?returnTo=toppings.html');
  };
  async function refresh() {
    const list = await fetchToppings(); acceptList(list);
    // Refresh metadata and remove withdrawn listings without auto-installing on other devices.
    const local = await localToppings();
    await chrome.storage.local.set({ [TOPPINGS_KEY]: local.filter(t => !t.preview).flatMap(t => {
      const current = list.find(x => x.id === t.id); return current ? [current] : [];
    }) });
    return list;
  }
  useEffect(() => onAuthState(next => { setUser(next); setAccountReady(true); }), []);
  useEffect(() => {
    let active = true; setLoading(true);
    fetchToppings().then(list => { if (active) acceptList(list); }).catch(e => { if(active) setError(e.message); }).finally(()=>{if(active)setLoading(false);});
    return () => { active = false; };
  }, [user?.uid]);
  useEffect(()=>{let alive=true;setCanReview(false);if(user)toppingRequest('/submissions').then(data=>{if(alive)setCanReview(data.canReview);}).catch(()=>{});return()=>{alive=false;};},[user?.uid,user?.emailVerified]);
  useEffect(() => { const close = (e: KeyboardEvent) => { if(active&&e.key==='Escape'&&!busy){setDetail(null);setPublishing(false);setCreating(false);setReadingGuide(false);setReviewing(false);} }; window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close); },[busy,active]);
  useEffect(() => {
    if (!active || (!creating && !publishing && !detail && !readingGuide && !reviewing)) return;
    const previous = document.activeElement as HTMLElement | null;
    const modal = document.querySelector<HTMLElement>('.modal');
    const controls = () => Array.from(modal?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input,select,textarea,summary') || []);
    controls()[0]?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const all = controls().filter(n => n.getClientRects().length);
      const first = all[0], last = all[all.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => { document.removeEventListener('keydown', trap); previous?.focus(); };
  }, [active, creating, publishing, detail?.id, readingGuide, reviewing]);
  async function run(action: () => Promise<void>) {
    setBusy(true);setError('');
    try { await action(); const list = await refresh(); setDetail(old=>old ? list.find(t=>t.id===old.id)||null : null); }
    catch(e) { setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.'); }
    finally { setBusy(false); }
  }
  async function install(t: Topping, button?:HTMLButtonElement) {
    const anchor=button?{button,top:button.getBoundingClientRect().top}:null;
    installAnchor.current=anchor;
    notify(t.id, '');
    await run(async()=>{await changeTopping(t,!t.installed);setItems(list=>list.map(x=>x.id===t.id?{...x,installed:!t.installed}:x));setDetail(old=>old?.id===t.id?{...old,installed:!t.installed}:old);notify(t.id, t.installed ? 'Removed' : 'Added to extension', 2400);});
    requestAnimationFrame(()=>requestAnimationFrame(()=>{if(installAnchor.current===anchor)installAnchor.current=null;}));
  }
  function startPublishing() {
    if(editingId){setPublishDraft({name:'',description:'',url:''});setSelectedIcon('');setImageData('');}
    setEditingId(null);setPublishing(true);
  }
  async function publish(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();const data=new FormData(event.currentTarget);
    await run(async()=>{
      if (!user) throw new Error('Sign in to publish.');
      if (!selectedIcon) throw new Error('Choose an icon.');
      if (!imageData) throw new Error('Choose a preview image.');
      await toppingRequest(editingId?`/${editingId}/edit`:'', 'POST', {
      name:data.get('name'),description:data.get('description'),url:data.get('url'),...(imageData.startsWith('data:')?{imageData}:{image:imageData}),
      icon:selectedIcon
    });setPublishing(false);setImageData('');setSelectedIcon('');setPublishDraft({name:'',description:'',url:''});setEditingId(null);notify('publish', 'Submitted for review');});
  }
  async function preview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true); setError(''); setPreviewAdded(false);
    try {
      await savePreviewTopping(String(data.get('name') || ''), String(data.get('url') || ''));
      setPreviewAdded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the preview.');
    } finally { setBusy(false); }
  }
  const visible = items.filter(t=>`${t.name} ${t.description} ${t.author}`.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>{const x=ranking.current.get(a.id)||a,y=ranking.current.get(b.id)||b;return sort==='newest'?y.createdAt-x.createdAt:y.users-x.users||y.createdAt-x.createdAt||a.id.localeCompare(b.id);});
  function stars(t: Topping) { return <span className="stars" aria-label={t.rating == null ? 'Not rated yet' : `${t.rating.toFixed(1)} out of 5 stars`}><span aria-hidden="true">★★★★★</span><span aria-hidden="true" style={{width:`${(t.rating||0)*20}%`}}>★★★★★</span></span>; }
  return <div className="bar-page">
    <header className="bar-nav"><a className="brand" href="toppings.html"><span className="brand-icon">✳</span> Topping Bar</a><div className="nav-actions"><button className="quiet account-entry" disabled={!accountReady} onClick={signIn}>{!accountReady ? 'Restoring account…' : user ? user.displayName || 'My account' : 'Sign in'}</button>{user&&<button className="quiet" onClick={()=>setReviewing(true)}>{canReview?'Review Toppings':'My submissions'}</button>}<button className="quiet preview-entry" onClick={()=>{setError('');setPreviewAdded(false);setCreating(true);}}>Preview a Topping</button><div className="action-with-note"><button className="primary" onClick={()=>{startPublishing();}}>Publish a Topping <span>↗</span></button><span className="action-note" role="status">{notes.publish}</span></div></div></header>
    <main>
      <section className="community-intro">
        <div className="intro-item">
          <div className="intro-illustration intro-illustration-add" aria-hidden="true">
            <svg viewBox="0 0 48 48"><rect x="6" y="9" width="27" height="30" rx="5"/><path d="M12 16h15M12 22h11M36 26v14M29 33h14"/></svg>
          </div>
          <div><h1>Add to your extension</h1><p>Toppings are add-ons you can add or remove anytime.</p></div>
        </div>
        <div className="intro-item">
          <div className="intro-illustration intro-illustration-community" aria-hidden="true">
            <svg viewBox="0 0 48 48"><circle cx="18" cy="18" r="6"/><circle cx="34" cy="20" r="5"/><path d="M7 39c1-8 5-12 11-12s10 4 11 12M28 29c2-2 4-3 7-3 5 0 8 4 9 11"/></svg>
          </div>
          <div><h2>Made by the community</h2><p>Anyone can create and share their own Topping.</p></div>
        </div>
      </section>
      <InstalledToppingManager onChange={refresh} onLayoutChange={keepInstallPosition}/>
      {user&&<OwnToppingSubmissions onEdit={t=>{setEditingId(t.id);setPublishDraft({name:t.name,description:t.description,url:t.url});setSelectedIcon(t.icon);setImageData(t.imageData||t.image);setError('');setPublishing(true);}} key={user.uid} revision={`${publishing}:${reviewing}:${items.map(t=>t.id).join(",")}`}/>}
      <section className="catalog"><div className="catalog-heading"><h2>Find your next Topping</h2><div className="filters"><input aria-label="Search Toppings" type="search" placeholder="Search Toppings…" value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="Sort Toppings" value={sort} onChange={e=>{ranking.current=new Map(items.map(t=>[t.id,{users:t.users,createdAt:t.createdAt}]));setSort(e.target.value);}}><option value="popular">Most users</option><option value="newest">Newest</option></select></div></div>
      {error && <p className="catalog-error error" role="alert">{error} <button onClick={()=>void run(async()=>{})} disabled={busy}>Retry</button></p>}
      {loading ? <p className="empty" role="status">Loading Toppings…</p> : <div className="card-grid">{!search.trim()&&<article className="topping-card create-card"><button type="button" onClick={()=>setReadingGuide(true)}><span className="create-plus" aria-hidden="true">＋</span><h3>Make your own Topping</h3><p>Learn about making your own Topping. You don&apos;t have to know how to code.</p></button></article>}{visible.map(t=><article className="topping-card" key={t.id}><button className="preview" aria-label={`View ${t.name}`} onClick={()=>setDetail(t)}><img src={t.image==='builtin:ask-sja'?'toppings/ask-sja.svg':t.image} alt={`${t.name} preview`} loading="lazy" referrerPolicy="no-referrer" onError={e=>{e.currentTarget.onerror=null;e.currentTarget.src='toppings/unavailable.svg';}}/></button><div className="card-body"><div className="card-title"><button onClick={()=>setDetail(t)}>{t.name}</button><div className="action-with-note card-action"><ToppingInstallButton installed={t.installed} confirmation={notes[t.id]} busy={busy} onClick={event=>void install(t,event.currentTarget)}/></div></div><p className="author">By {t.author}</p><p className="description">{t.description}</p><div className="card-stats"><button onClick={()=>setDetail(t)} className="rating">{stars(t)}<span>{t.rating==null?'Not rated yet':`${t.rating.toFixed(1)} (${t.ratingCount})`}</span></button><span className="users">{t.users.toLocaleString()} Users</span></div></div></article>)}</div>}
      {!loading&&!error&&!visible.length&&<p className="empty">{search?'No Toppings match your search.':'The bar is ready for its first Topping.'}</p>}
      </section>
    </main>
    <div ref={scrollSpace} aria-hidden="true"/>
    {readingGuide&&<div className="modal-backdrop" onClick={event=>{if(event.target===event.currentTarget)setReadingGuide(false);}}><section className="modal topping-guide" role="dialog" aria-modal="true" aria-labelledby="topping-guide-title"><button className="close" aria-label="Close" onClick={()=>setReadingGuide(false)}>×</button><ToppingGuide/><div className="guide-actions"><button className="quiet" onClick={()=>{setReadingGuide(false);setError('');setPreviewAdded(false);setCreating(true);}}>Preview a Topping</button><button className="primary" onClick={()=>{setReadingGuide(false);setError('');startPublishing();}}>Publish a Topping</button></div></section></div>}
    {creating&&<div className="modal-backdrop" onClick={event=>{if(event.target===event.currentTarget&&!busy)setCreating(false);}}><section className="modal creator-modal" role="dialog" aria-modal="true" aria-labelledby="creator-title"><button className="close" aria-label="Close" disabled={busy} onClick={()=>setCreating(false)}>×</button><div className="eyebrow">TRY IT IN HILLTOPPERS</div><h2 id="creator-title">Preview your Topping.</h2><p>Enter a hosted URL or localhost address to try your Topping in the extension.</p><form onSubmit={preview}><div className="modal-field"><label htmlFor="preview-name">Topping name</label><input id="preview-name" name="name" maxLength={48} defaultValue="Preview Topping"/></div><div className="modal-field"><label htmlFor="preview-url">Topping URL</label><input id="preview-url" name="url" type="url" required placeholder="https://your-topping.example"/></div><p className="form-note">The webpage must allow embedding in an iframe.</p>{error&&<p role="alert" className="error">{error}</p>}<button className="primary" disabled={busy}>{busy?'Adding…':'Add preview'}</button>{previewAdded&&<p className="preview-success" role="status">Preview added. Open the extension to see it.</p>}</form><div className="creator-publish"><div><strong>Ready to share it?</strong><p>Publish your finished Topping to the community.</p></div><button className="quiet creator-publish-button" onClick={()=>{setCreating(false);startPublishing();}}>Publish a Topping</button></div></section></div>}
    {publishing&&<div className="modal-backdrop" onClick={event=>{if(event.target===event.currentTarget&&!busy)setPublishing(false);}}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="publish-title"><button className="close" aria-label="Close" disabled={busy} onClick={()=>setPublishing(false)}>×</button><div className="eyebrow">MADE BY YOU</div><h2 id="publish-title">{editingId?'Edit your Topping.':'Share your Topping.'}</h2>{!schoolAccount?<><p>Link a verified school email to publish. Your name will be public; your email stays private.</p><button className="primary" onClick={signIn}>{user ? 'Link school email' : 'Sign in'}</button></>:<form onSubmit={publish}><p className="form-note">Publishing as <strong>{linkedAuthor}</strong>.</p><fieldset className="topping-icon-picker"><legend><span className="field-caption">Icon <span className="required-mark" aria-hidden="true">*</span></span></legend><div>{TOPPING_ICONS.map(({id,label})=><button key={id} type="button" aria-label={label} aria-pressed={selectedIcon===id} title={label} onClick={()=>setSelectedIcon(id)}><ToppingIcon icon={id}/></button>)}</div></fieldset><div className="modal-field"><label htmlFor="publish-name"><span className="field-caption">Name <span className="required-mark" aria-hidden="true">*</span></span></label><input id="publish-name" aria-label="Name" name="name" value={publishDraft.name} onChange={e=>setPublishDraft(d=>({...d,name:e.target.value}))} required minLength={2} maxLength={48}/></div><div className="modal-field"><label htmlFor="publish-description">Short description</label><textarea id="publish-description" name="description" aria-label="Short description" value={publishDraft.description} onChange={e=>setPublishDraft(d=>({...d,description:e.target.value}))} maxLength={180} rows={2}/></div><div className="modal-field"><label htmlFor="publish-url"><span className="field-caption">Topping URL <span className="required-mark" aria-hidden="true">*</span></span></label><input id="publish-url" aria-label="Topping URL" name="url" type="url" value={publishDraft.url} onChange={e=>setPublishDraft(d=>({...d,url:e.target.value}))} required placeholder="https://…"/></div><PreviewImageInput value={imageData} onChange={setImageData} disabled={busy}/><p className="form-note">{editingId?'Changes are reviewed before going live.':'Your Topping must allow embedding in an iframe. Submissions are reviewed before appearing in the bar.'}</p>{error&&<p role="alert" className="error">{error}</p>}<div className="publish-actions"><button className="primary" disabled={busy}>{busy?'Submitting…':'Submit for review'}</button></div></form>}</section></div>}
    {reviewing&&<ToppingSubmissions key={user?.uid} onClose={()=>setReviewing(false)} onUpdate={refresh} onBusyChange={setBusy}/>}
    {detail&&<div className="modal-backdrop" onClick={event=>{if(event.target===event.currentTarget&&!busy)setDetail(null);}}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="detail-title"><button className="close" aria-label="Close" disabled={busy} onClick={()=>setDetail(null)}>×</button><h2 id="detail-title">{detail.name}</h2><p className="author">By {detail.author}</p><p>{detail.description}</p><div className="detail-actions"><div className="action-with-note"><ToppingInstallButton installed={detail.installed} confirmation={notes[detail.id]} busy={busy} onClick={()=>void install(detail)}/></div><a href={detail.url} target="_blank" rel="noopener noreferrer">Open website ↗</a></div><h3>Your rating</h3>{!user&&<button className="quiet" onClick={signIn}>Sign in to rate</button>}<div className="action-with-note rating-action"><div className="rate-buttons" aria-label="Rate this Topping">{[1,2,3,4,5].map(n=><button key={n} aria-label={`${n} ${n===1?'star':'stars'}`} aria-pressed={detail.myRating===n} disabled={busy||!detail.installed||!user} onClick={()=>void run(async()=>{await toppingRequest(`/${detail.id}/rating`,'POST',{stars:n});notify(`rating-${detail.id}`, 'Rating saved');})}>{n<=(detail.myRating||0)?'★':'☆'}</button>)}</div><span className="action-note" role="status">{notes[`rating-${detail.id}`]}</span></div>{!detail.installed&&<p className="form-note">Add this Topping to leave a rating.</p>}<details className="report"><summary>Report a problem</summary><form onSubmit={e=>{e.preventDefault();const reason=new FormData(e.currentTarget).get('reason');void run(async()=>{await toppingRequest(`/${detail.id}/report`,'POST',{reason});notify(`report-${detail.id}`, 'Report sent');});}}><div className="modal-field"><label htmlFor="report-reason">What happened?</label><textarea id="report-reason" name="reason" required minLength={5} maxLength={1000}/></div><div className="action-with-note report-action"><button disabled={busy||!user}>Send report</button><span className="action-note" role="status">{notes[`report-${detail.id}`]}</span></div>{!user&&<button type="button" onClick={signIn}>Sign in to report</button>}</form></details>{(detail.owned||canReview)&&<button className="unpublish" disabled={busy} onClick={()=>{if(window.confirm('Unpublish this Topping? It will be removed from the catalog.'))void run(async()=>{await toppingRequest(`/${detail.id}`,'DELETE');setDetail(null);});}}>Unpublish Topping</button>}{error&&<p role="alert" className="error">{error}</p>}</section></div>}
  </div>;
}
