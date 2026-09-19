import React, { useEffect, useRef, useState } from 'react';
import { updateProfile } from 'firebase/auth';
import { onAuthState, type AuthUser } from '../firebase/auth';
import { changeTopping, fetchToppings, toppingRequest, TOPPINGS_KEY, localToppings, savePreviewTopping, type Topping } from '../services/toppingsService';
import './toppings.css';

export default function ToppingBar({ onAccount, active = true }: { onAccount?: () => void; active?: boolean }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accountReady, setAccountReady] = useState(false);
  const [items, setItems] = useState<Topping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const noteTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => () => { noteTimers.current.forEach(clearTimeout); }, []);
  function notify(key: string, text: string) {
    clearTimeout(noteTimers.current.get(key));
    setNotes(current => ({ ...current, [key]: text }));
    noteTimers.current.set(key, setTimeout(() => {
      setNotes(current => ({ ...current, [key]: '' }));
      noteTimers.current.delete(key);
    }, 4000));
  }
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('popular');
  const [creating, setCreating] = useState(false);
  const [previewAdded, setPreviewAdded] = useState(false);
  const [publishing, setPublishing] = useState(() => sessionStorage.getItem('resumeToppingPublish') === 'true');
  useEffect(() => { sessionStorage.removeItem('resumeToppingPublish'); }, []);
  const [detail, setDetail] = useState<Topping | null>(null);
  const schoolAccount = !!user?.emailVerified && /@(student\.)?stjacademy\.org$/i.test(user.email || '');
  const signIn = () => {
    if (onAccount) { onAccount(); return; }
    if (publishing) sessionStorage.setItem('resumeToppingPublish', 'true');
    window.location.href = chrome.runtime.getURL('login.html?returnTo=toppings.html');
  };
  async function refresh() {
    const list = await fetchToppings(); setItems(list);
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
    fetchToppings().then(list => { if (active) setItems(list); }).catch(e => { if(active) setError(e.message); }).finally(()=>{if(active)setLoading(false);});
    return () => { active = false; };
  }, [user?.uid]);
  useEffect(() => { const close = (e: KeyboardEvent) => { if(active&&e.key==='Escape'&&!busy){setDetail(null);setPublishing(false);setCreating(false);} }; window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close); },[busy,active]);
  useEffect(() => {
    if (!active || (!creating && !publishing && !detail)) return;
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
  }, [active, creating, publishing, detail?.id]);
  async function run(action: () => Promise<void>) {
    setBusy(true);setError('');
    try { await action(); const list = await refresh(); setDetail(old=>old ? list.find(t=>t.id===old.id)||null : null); }
    catch(e) { setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.'); }
    finally { setBusy(false); }
  }
  async function install(t: Topping) {
    notify(t.id, '');
    await run(async()=>{await changeTopping(t,!t.installed);setItems(list=>list.map(x=>x.id===t.id?{...x,installed:!t.installed}:x));setDetail(old=>old?.id===t.id?{...old,installed:!t.installed}:old);notify(t.id, t.installed ? 'Removed' : 'Added. You can see it in the extension.');});
  }
  async function publish(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();const data=new FormData(event.currentTarget);
    await run(async()=>{
      if (!user) throw new Error('Sign in to publish.');
      const author = String(data.get('author') || '').trim();
      if (author.length < 2 || /^anonymous$/i.test(author)) throw new Error('Enter your real name.');
      if (author !== user.displayName) { await updateProfile(user, { displayName: author }); await user.getIdToken(true); }
      await toppingRequest('', 'POST', {
      name:data.get('name'),description:data.get('description'),url:data.get('url'),image:data.get('image'),
      graduationYear:data.get('year') ? Number(data.get('year')) : null
    });setPublishing(false);notify('publish', 'Published');});
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
  const visible = items.filter(t=>`${t.name} ${t.description} ${t.author}`.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>sort==='newest'?b.createdAt-a.createdAt:b.users-a.users||b.createdAt-a.createdAt);
  function stars(t: Topping) { return <span className="stars" aria-label={t.rating == null ? 'Not rated yet' : `${t.rating.toFixed(1)} out of 5 stars`}><span aria-hidden="true">★★★★★</span><span aria-hidden="true" style={{width:`${(t.rating||0)*20}%`}}>★★★★★</span></span>; }
  return <div className="bar-page">
    <header className="bar-nav"><a className="brand" href="toppings.html"><span className="brand-icon">✳</span> Topping Bar</a><div className="nav-actions"><button className="quiet" disabled={!accountReady} onClick={signIn}>{!accountReady ? 'Restoring account…' : user ? user.displayName || 'My account' : 'Sign in'}</button><div className="action-with-note"><button className="primary" onClick={()=>setPublishing(true)}>Publish a Topping <span>↗</span></button><span className="action-note" role="status">{notes.publish}</span></div></div></header>
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
      <section className="catalog"><div className="catalog-heading"><h2>Find your next Topping</h2><div className="filters"><input aria-label="Search Toppings" type="search" placeholder="Search Toppings…" value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="Sort Toppings" value={sort} onChange={e=>setSort(e.target.value)}><option value="popular">Most users</option><option value="newest">Newest</option></select></div></div>
      {error && <p className="catalog-error error" role="alert">{error} <button onClick={()=>void run(async()=>{})} disabled={busy}>Retry</button></p>}
      {loading ? <p className="empty" role="status">Loading Toppings…</p> : <div className="card-grid">{visible.map(t=><article className="topping-card" key={t.id}><button className="preview" aria-label={`View ${t.name}`} onClick={()=>setDetail(t)}><img src={t.image==='builtin:ask-sja'?'toppings/ask-sja.svg':t.image} alt={`${t.name} preview`} loading="lazy" referrerPolicy="no-referrer" onError={e=>{e.currentTarget.onerror=null;e.currentTarget.src='toppings/unavailable.svg';}}/></button><div className="card-body"><div className="card-title"><button onClick={()=>setDetail(t)}>{t.name}</button><div className="action-with-note card-action"><button className={t.installed?'added':'add'} disabled={busy} onClick={()=>void install(t)}>{t.installed?'Remove':'＋ Add'}</button><span className="action-note" role="status">{notes[t.id]}</span></div></div><p className="author">By {t.author}{t.graduationYear ? ` @ ${t.graduationYear}`:''}</p><p className="description">{t.description}</p><div className="card-stats"><button onClick={()=>setDetail(t)} className="rating">{stars(t)}<span>{t.rating==null?'Not rated yet':`${t.rating.toFixed(1)} (${t.ratingCount})`}</span></button><span className="users">{t.users.toLocaleString()} Users</span></div></div></article>)}{!search.trim()&&<article className="topping-card create-card"><button type="button" onClick={()=>{setError('');setPreviewAdded(false);setCreating(true);}}><span className="create-plus" aria-hidden="true">＋</span><h3>Make your own Topping</h3><p>Learn about making your own Topping. You don&apos;t have to know how to code.</p></button></article>}</div>}
      {!loading&&!error&&!visible.length&&<p className="empty">{search?'No Toppings match your search.':'The bar is ready for its first Topping.'}</p>}
      </section>
    </main>
    {creating&&<div className="modal-backdrop"><section className="modal creator-modal" role="dialog" aria-modal="true" aria-labelledby="creator-title"><button className="close" aria-label="Close" disabled={busy} onClick={()=>setCreating(false)}>×</button><div className="eyebrow">TRY IT IN HILLTOPPERS</div><h2 id="creator-title">Preview your Topping.</h2><p>Start your Topping&apos;s local development server, then add its address here. It will appear temporarily in the extension.</p><form onSubmit={preview}><label>Topping name<input name="name" maxLength={48} defaultValue="Preview Topping"/></label><label>Local address<input name="url" type="url" required defaultValue="http://localhost:5173" placeholder="http://localhost:5173"/></label><p className="form-note">Changes will refresh automatically when your development server supports live reload.</p>{error&&<p role="alert" className="error">{error}</p>}<button className="primary" disabled={busy}>{busy?'Adding…':'Add preview'}</button>{previewAdded&&<p className="preview-success" role="status">Preview added. Open the extension to see it.</p>}</form><div className="creator-publish"><div><strong>Ready to share it?</strong><p>Publish your finished Topping to the community.</p></div><button className="quiet creator-publish-button" onClick={()=>{setCreating(false);setPublishing(true);}}>Publish a Topping</button></div></section></div>}
    {publishing&&<div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="publish-title"><button className="close" aria-label="Close" disabled={busy} onClick={()=>setPublishing(false)}>×</button><div className="eyebrow">MADE BY YOU</div><h2 id="publish-title">Share your Topping.</h2>{!schoolAccount?<><p>Publish with a verified @student.stjacademy.org or @stjacademy.org account. Your account name will be shown publicly; your email stays private.</p><button className="primary" onClick={signIn}>Sign in with school email</button></>:<form onSubmit={publish}><p className="form-note">Publishing as <strong>{user?.displayName||'your account name'}</strong>. Your author name will appear on your card and update your account name.</p><label>Author name<input name="author" required minLength={2} maxLength={80} defaultValue={user?.displayName || ''}/></label><label>Name<input name="name" required minLength={2} maxLength={48}/></label><label>Short description<textarea name="description" required minLength={10} maxLength={180} rows={2}/></label><label>Topping URL<input name="url" type="url" required placeholder="https://…"/></label><label>Preview image URL<input name="image" type="url" required placeholder="https://…/preview.png"/></label><p className="form-note">Use a landscape image. Your Topping must allow embedding in an iframe.</p><label>Graduation year <span>(optional)</span><input name="year" type="number" min={1950} max={2100}/></label>{error&&<p role="alert" className="error">{error}</p>}<button className="primary" disabled={busy}>{busy?'Publishing…':'Publish Topping'}</button></form>}</section></div>}
    {detail&&<div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="detail-title"><button className="close" aria-label="Close" disabled={busy} onClick={()=>setDetail(null)}>×</button><h2 id="detail-title">{detail.name}</h2><p className="author">By {detail.author}{detail.graduationYear ? ` @ ${detail.graduationYear}`:''}</p><p>{detail.description}</p><div className="detail-actions"><div className="action-with-note"><button className="primary" disabled={busy} onClick={()=>void install(detail)}>{detail.installed?'Remove Topping':'Add Topping'}</button><span className="action-note" role="status">{notes[detail.id]}</span></div><a href={detail.url} target="_blank" rel="noopener noreferrer">Open website ↗</a></div><h3>Your rating</h3>{!user&&<button className="quiet" onClick={signIn}>Sign in to rate</button>}<div className="action-with-note rating-action"><div className="rate-buttons" aria-label="Rate this Topping">{[1,2,3,4,5].map(n=><button key={n} aria-label={`${n} ${n===1?'star':'stars'}`} aria-pressed={detail.myRating===n} disabled={busy||!detail.installed||!user} onClick={()=>void run(async()=>{await toppingRequest(`/${detail.id}/rating`,'POST',{stars:n});notify(`rating-${detail.id}`, 'Rating saved');})}>{n<=(detail.myRating||0)?'★':'☆'}</button>)}</div><span className="action-note" role="status">{notes[`rating-${detail.id}`]}</span></div>{!detail.installed&&<p className="form-note">Add this Topping to leave a rating.</p>}<details className="report"><summary>Report a problem</summary><form onSubmit={e=>{e.preventDefault();const reason=new FormData(e.currentTarget).get('reason');void run(async()=>{await toppingRequest(`/${detail.id}/report`,'POST',{reason});notify(`report-${detail.id}`, 'Report sent');});}}><label>What happened?<textarea name="reason" required minLength={5} maxLength={1000}/></label><div className="action-with-note report-action"><button disabled={busy||!user}>Send report</button><span className="action-note" role="status">{notes[`report-${detail.id}`]}</span></div>{!user&&<button type="button" onClick={signIn}>Sign in to report</button>}</form></details>{detail.owned&&<button className="unpublish" disabled={busy} onClick={()=>{if(window.confirm('Unpublish this Topping? It will be removed from the catalog.'))void run(async()=>{await toppingRequest(`/${detail.id}`,'DELETE');setDetail(null);});}}>Unpublish my Topping</button>}{error&&<p role="alert" className="error">{error}</p>}</section></div>}
  </div>;
}
