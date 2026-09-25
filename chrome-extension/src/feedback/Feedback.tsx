import React, { useEffect, useRef, useState } from 'react';
import { onAuthState, type AuthUser } from '../firebase/auth';
import { suggestionRequest, type PublicSuggestion } from '../services/publicSuggestionsService';
import PublicSuggestions from './PublicSuggestions';
import {
  FEEDBACK_MAX_LENGTH,
  submitFeedback
} from '../services/feedbackService';

type Status = 'idle' | 'sending' | 'sent';

const Feedback = ({onAccount,active=true}:{onAccount?:()=>void;active?:boolean}) => {
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const [user,setUser]=useState<AuthUser|null>(null);
  const [isPublic,setPublic]=useState(false);
  const [author,setAuthor]=useState<string|null>(null);
  const [checking,setChecking]=useState(true);
  const [identityError,setIdentityError]=useState('');
  const [identityRevision,setIdentityRevision]=useState(0);
  const [submission,setSubmission]=useState<{item:PublicSuggestion;uid:string}|null>(null);
  const requestId=useRef(crypto.randomUUID());
  const sending=useRef(false);
  useEffect(()=>onAuthState(setUser),[]);
  useEffect(()=>{
    const changed=()=>setIdentityRevision(n=>n+1);
    window.addEventListener('school-email-linked',changed);
    return()=>window.removeEventListener('school-email-linked',changed);
  },[]);
  useEffect(()=>{
    if(!active)return;
    let alive=true;setChecking(true);setAuthor(null);setIdentityError('');
    suggestionRequest('/identity').then(data=>{if(alive)setAuthor(data.author);}).catch(()=>{if(alive)setIdentityError('Could not check your school account.');}).finally(()=>{if(alive)setChecking(false);});
    return()=>{alive=false;};
  },[user?.uid,user?.emailVerified,active,identityRevision]);
  const account=()=>{if(onAccount)onAccount();else window.location.href=chrome.runtime.getURL('login.html?returnTo=feedback.html');};
  const remaining = FEEDBACK_MAX_LENGTH - message.length;
  const canSend = status !== 'sending' && message.trim().length > 0 && remaining >= 0 && (!isPublic||(!checking&&!!author));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSend||sending.current) return;
    sending.current=true;
    setStatus('sending');
    setError(null);
    try {
      if(isPublic){
        const data=await suggestionRequest('',{message,requestId:requestId.current});
        setSubmission({uid:user!.uid,item:{id:data.id,message:message.trim(),author:author!,createdAt:Date.now(),upvotes:0,downvotes:0,myVote:0,canDelete:true}});
      }else await submitFeedback({ message, contact });
      requestId.current=crypto.randomUUID();
      setStatus(isPublic?'idle':'sent');
      setMessage('');
    } catch (err) {
      setStatus('idle');
      setError(err instanceof Error ? err.message : 'Could not send. Try again.');
    } finally {sending.current=false;}
  };

  return (
    <main className="feedback">
      <header className="feedback__header">
        <h1>Suggestions</h1>
      </header>

      <section className="feedback__panel">
          <form onSubmit={handleSubmit} className="feedback__form">
            <label className="feedback__field">
              <span className="feedback__label">Suggestion</span>
              <textarea
                value={message}
                onChange={(event) => {setStatus('idle');setMessage(event.target.value);requestId.current=crypto.randomUUID();}}
                placeholder="What should we change or add?"
                rows={7}
                autoFocus
                aria-label="Your suggestion"
                disabled={status === 'sending'}
                aria-describedby={remaining < 300 ? 'feedback-remaining' : undefined}
              />
              {remaining < 300 ? (
                <span id="feedback-remaining" className={`feedback__count ${remaining < 0 ? 'over' : ''}`}>
                  {remaining} left
                </span>
              ) : null}
            </label>
            <div className="feedback__identity-slot">
            <label className="feedback__field" style={{ visibility: isPublic ? 'hidden' : 'visible' }} aria-hidden={isPublic}>
              <span className="feedback__label">
                Contact <span className="feedback__optional">Optional</span>
              </span>
              <input type="text" value={contact} onChange={(event) => setContact(event.target.value)} autoComplete="off" disabled={isPublic || status === 'sending'}/>
            </label>
            <div className="feedback__public-choice" style={{ visibility: isPublic ? 'visible' : 'hidden' }} aria-hidden={!isPublic}>
              {checking?<p>Checking school account…</p>:author?<p>Posting as <strong>{author}</strong>. Everyone can see this suggestion.</p>:identityError?<p role="alert">{identityError} <button type="button" onClick={()=>setIdentityRevision(n=>n+1)}>Retry</button></p>:<p>Verify your school email to post publicly. <button type="button" onClick={account}>{user?'Manage account':'Sign in'}</button></p>}
            </div>
            </div>
            {error ? <p className="feedback__error" role="alert">{error}</p> : null}
            <div className="feedback__actions">
            <label><input type="checkbox" checked={isPublic} disabled={status==='sending'} onChange={e=>{setPublic(e.target.checked);setError(null);}}/>Post publicly</label>

              <button type="submit" className="feedback__primary" disabled={!canSend}>
                {status === 'sending' ? 'Sending…' : status === 'sent' ? 'Sent' : isPublic?'Post':'Send'}
              </button>
            </div>
          </form>
      </section>
      <PublicSuggestions uid={user?.uid||null} submission={submission} active={active} onAccount={account}/>
    </main>
  );
};

export default Feedback;
