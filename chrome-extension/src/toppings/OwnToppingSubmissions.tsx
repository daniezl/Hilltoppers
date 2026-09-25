import { useEffect, useState } from 'react';
import { toppingRequest } from '../services/toppingsService';
import ToppingIcon from './ToppingIcon';

export type Submission = { id:string; name:string; description:string; image:string; imageData?:string; revisionStatus?:string; url:string; icon:string; status:string; hidden:number };
export default function OwnToppingSubmissions({revision,onEdit}:{revision:string;onEdit:(t:Submission)=>void}) {
  const [items,setItems]=useState<Submission[]>([]);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    let alive=true;
    toppingRequest('/submissions?own=1').then(data=>{if(alive){setItems(data.toppings);setError('');}})
      .catch(()=>{if(alive)setError('Could not load your submissions.');})
      .finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;};
  },[revision]);
  return <section className="own-submissions" aria-labelledby="own-submissions-title">
    <h2 id="own-submissions-title">Your submissions</h2>
    {error?<p className="error" role="alert">{error}</p>:loading?<p role="status">Loading…</p>:!items.length?<p>No submissions yet.</p>:
    <div className="own-submissions-list">{items.map(t=><div className="own-submission" key={t.id}>
      <ToppingIcon icon={t.icon}/><a href={t.url} target="_blank" rel="noopener noreferrer">{t.name}</a>
      <span>{t.hidden?'Unpublished':t.revisionStatus==='pending'?'Changes pending review':t.revisionStatus==='rejected'?'Changes not approved':t.status==='pending'?'Pending review':t.status==='approved'?'Published':'Not approved'}</span>{!t.hidden&&<button className="quiet" onClick={()=>onEdit(t)}>Edit</button>}
    </div>)}</div>}
  </section>;
}
