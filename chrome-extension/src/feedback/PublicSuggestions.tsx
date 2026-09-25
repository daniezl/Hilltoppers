import { useEffect, useRef, useState } from 'react';
import { ArrowFatUp, ArrowFatDown, Trash } from '@phosphor-icons/react';
import { suggestionRequest, type PublicSuggestion } from '../services/publicSuggestionsService';

export default function PublicSuggestions({uid,submission,active,onAccount}:{uid:string|null;submission:{item:PublicSuggestion;uid:string}|null;active:boolean;onAccount:()=>void}) {
  const [items,setItems]=useState<PublicSuggestion[]>([]),[cursor,setCursor]=useState<string|null>(null);
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[voting,setVoting]=useState<string|null>(null),[retry,setRetry]=useState(0);
  const generation=useRef(0),lock=useRef(false);
  const latestSubmission=useRef(submission);
  const [highlighted,setHighlighted]=useState<string|null>(null);
  useEffect(()=>{
    latestSubmission.current=submission;
    if(!submission||submission.uid!==uid)return;
    setItems(old=>[submission.item,...old.filter(item=>item.id!==submission.item.id)]);
    setHighlighted(submission.item.id);
    const timer=window.setTimeout(()=>setHighlighted(null),2400);
    return()=>window.clearTimeout(timer);
  },[submission,uid]);
  useEffect(()=>{
    if(!active)return;
    const current=++generation.current;
    const submissionAtStart=latestSubmission.current;
    setLoading(true);setError('');setItems([]);setCursor(null);
    suggestionRequest().then(data=>{if(current===generation.current){const posted=latestSubmission.current;
      setItems(posted&&posted!==submissionAtStart&&posted.uid===uid?[data.suggestions.find((item:PublicSuggestion)=>item.id===posted.item.id)||posted.item,...data.suggestions.filter((item:PublicSuggestion)=>item.id!==posted.item.id)]:data.suggestions);setCursor(data.cursor);}}).catch(e=>{if(current===generation.current)setError(e.message);}).finally(()=>{if(current===generation.current)setLoading(false);});
    return()=>{generation.current++;};
  },[uid,active,retry]);
  async function more(){
    if(loading||!cursor)return;
    const current=generation.current;setLoading(true);setError('');
    try{const data=await suggestionRequest('?cursor='+encodeURIComponent(cursor));if(current===generation.current){setItems(old=>[...old,...data.suggestions.filter((t:PublicSuggestion)=>!old.some(x=>x.id===t.id))]);setCursor(data.cursor);}}
    catch(e){if(current===generation.current)setError(e instanceof Error?e.message:'Could not load suggestions.');}
    finally{if(current===generation.current)setLoading(false);}
  }
  async function vote(item:PublicSuggestion,value:number){
    if(!uid){onAccount();return;}
    if(lock.current)return;
    const current=generation.current;lock.current=true;setVoting(item.id);setError('');
    try{const data=await suggestionRequest(`/${item.id}/vote`,{value:item.myVote===value?0:value});if(current===generation.current)setItems(old=>old.map(t=>t.id===item.id?{...t,...data}:t));}
    catch(e){if(current===generation.current)setError(e instanceof Error?e.message:'Could not save your vote.');}
    finally{lock.current=false;setVoting(null);}
  }
  async function remove(item:PublicSuggestion){
    if(lock.current||!window.confirm('Delete this suggestion? This cannot be undone.'))return;
    const current=generation.current;lock.current=true;setVoting(item.id);setError('');
    try{await suggestionRequest(`/${item.id}`,undefined,'DELETE');if(current===generation.current){if(latestSubmission.current?.item.id===item.id)latestSubmission.current=null;setItems(old=>old.filter(t=>t.id!==item.id));}}
    catch(e){if(current===generation.current)setError(e instanceof Error?e.message:'Could not delete this suggestion.');}
    finally{lock.current=false;setVoting(null);}
  }
  return <section className="public-suggestions" aria-label="Public suggestions">
    {error&&<p className="feedback__error" role="alert">{error} <button type="button" className="feedback__secondary" onClick={()=>setRetry(n=>n+1)}>Retry</button></p>}
    {!loading&&!error&&!items.length&&<p className="public-suggestions-empty">No public suggestions yet.</p>}
    {items.map(item => <article className={`public-suggestion${highlighted===item.id?' public-suggestion--new':''}`} key={item.id}>
      <div className="public-suggestion-byline">
        <span>{item.author}</span>
        <span aria-hidden="true">·</span>
        <time dateTime={new Date(item.createdAt).toISOString()}>{new Date(item.createdAt).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</time>
      </div>
      <p>{item.message}</p>
      <div className="suggestion-footer">
        <div className="suggestion-votes" data-vote={item.myVote}>
          <button type="button" aria-label={`Upvote suggestion by ${item.author}`} aria-pressed={item.myVote===1} disabled={voting!==null} onClick={()=>void vote(item,1)}><ArrowFatUp weight={item.myVote===1?'fill':'regular'} aria-hidden="true"/></button>
          <span className="suggestion-score" aria-live="polite" aria-label={`Score: ${item.upvotes-item.downvotes}`}>{item.upvotes-item.downvotes}</span>
          <button type="button" aria-label={`Downvote suggestion by ${item.author}`} aria-pressed={item.myVote===-1} disabled={voting!==null} onClick={()=>void vote(item,-1)}><ArrowFatDown weight={item.myVote===-1?'fill':'regular'} aria-hidden="true"/></button>
        </div>
        {item.canDelete&&<button type="button" className="suggestion-delete" aria-label={`Delete suggestion by ${item.author}`} disabled={voting!==null} onClick={()=>void remove(item)}><Trash aria-hidden="true"/>Delete</button>}
      </div>
    </article>)}
    {loading&&<p role="status" className="public-suggestions-empty">Loading…</p>}
    {cursor&&<button type="button" className="feedback__secondary" disabled={loading} onClick={()=>void more()}>Load more</button>}
  </section>;
}
