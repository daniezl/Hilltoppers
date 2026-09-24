import { useEffect, useState } from 'react';
import { toppingRequest, savePreviewTopping } from '../services/toppingsService';

type Submission={id:string;name:string;description:string;author:string;image:string;url:string;status:'pending'|'approved'|'rejected'};
export default function ToppingSubmissions({onClose,onUpdate,onBusyChange}:{onClose:()=>void;onUpdate:()=>Promise<unknown>;onBusyChange:(busy:boolean)=>void}) {
  const [items,setItems]=useState<Submission[]>([]),[canReview,setCanReview]=useState(false),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState('');
  async function refresh(){const data=await toppingRequest('/submissions');setItems(data.toppings);setCanReview(data.canReview);}
  useEffect(()=>{let alive=true;toppingRequest('/submissions').then(data=>{if(alive){setItems(data.toppings);setCanReview(data.canReview);}}).catch(e=>{if(alive)setError(e.message);}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[]);
  async function review(id:string,status:'approved'|'rejected'){
    setBusy(true);onBusyChange(true);setError('');setNote('');
    try {await toppingRequest(`/${id}/review`,'POST',{status});await refresh();await onUpdate();}
    catch(e){setError(e instanceof Error?e.message:'Could not review this Topping.');}finally{setBusy(false);onBusyChange(false);}
  }
  return <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}><section className="modal submissions-modal" role="dialog" aria-modal="true" aria-labelledby="submissions-title">
    <button className="close" aria-label="Close" disabled={busy} onClick={onClose}>×</button><h2 id="submissions-title">{canReview?'Review Toppings':'My submissions'}</h2>
    {error&&<p className="error" role="alert">{error}</p>}{note&&<p role="status">{note}</p>}
    {loading?<p role="status">Loading…</p>:!items.length?<p>No submissions yet.</p>:items.map(t=><article className="submission" key={t.id}>
      <img src={t.image==='builtin:ask-sja'?'toppings/ask-sja.svg':t.image} alt={`${t.name} preview`} referrerPolicy="no-referrer"/>
      <div className="submission-heading"><h3>{t.name}</h3><span>{t.status==='pending'?'Pending review':t.status==='approved'?'Published':'Not approved'}</span></div>
      <p className="author">By {t.author}</p><p>{t.description}</p>
      <a href={t.url} target="_blank" rel="noopener noreferrer">Open website ↗</a>
      <div className="submission-actions"><button className="quiet" disabled={busy} onClick={()=>{setError('');void savePreviewTopping(t.name,t.url).then(()=>setNote('Preview added to the extension.')).catch(e=>setError(e.message));}}>Preview in extension</button>
      {canReview&&t.status==='pending'&&<><button className="primary" disabled={busy} onClick={()=>void review(t.id,'approved')}>Approve</button><button className="quiet" disabled={busy} onClick={()=>{if(window.confirm(`Reject ${t.name}?`))void review(t.id,'rejected');}}>Reject</button></>}</div>
    </article>)}
  </section></div>;
}
