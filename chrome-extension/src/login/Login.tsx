import React, { useEffect, useState } from 'react';
import { FirebaseError } from 'firebase/app';
import { onAuthState, signInWithGoogle, signOut, isSchoolEmail, getSchoolEmail,
  requestSchoolEmailCode, linkSchoolEmail, unlinkSchoolEmail, type AuthUser } from '../firebase/auth';
import './login.css';
import CodeInput from './CodeInput';
import SchoolLinkButton from './SchoolLinkButton';

const destinations: Record<string, string> = {
  'class-settings.html': 'Class settings', 'toppings.html': 'Topping Bar'
};

function mapAuthError(error: unknown): string {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case 'auth/account-exists-with-different-credential':
        return 'This email already has a Hilltoppers account that was made with a password. Try another Google account, or ask the developer to move that account to Google.';
      case 'auth/user-disabled':
        return 'This account has been disabled. Contact support if you believe this is a mistake.';
      case 'auth/network-request-failed':
        return 'Network error. Check your connection and try again.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please wait a moment before trying again.';
      case 'auth/operation-not-allowed':
        return 'Google sign-in is not turned on for Hilltoppers yet.';
      default:
        return `Could not complete this request (${error.code}). Please try again.`;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Unable to sign in right now. Please try again.';
}

function GoogleMark() {
  return <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z"/>
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"/>
    <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"/>
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"/>
  </svg>;
}

export default function Login({ returnPage, onNavigate }: { returnPage?: string; onNavigate?: (page: string) => void }) {
  const requested = returnPage ?? new URLSearchParams(location.search).get('returnTo') ?? '';
  const returnTo = Object.prototype.hasOwnProperty.call(destinations, requested) ? requested : '';
  const followReturn = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (onNavigate) { event.preventDefault(); onNavigate(returnTo); }
  };
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [school, setSchool] = useState<{email:string|null;verified:boolean}|null>(null);
  const [schoolLoading, setSchoolLoading] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [schoolInput, setSchoolInput] = useState('');
  const [schoolChallenge, setSchoolChallenge] = useState('');
  const [schoolCode, setSchoolCode] = useState('');
  const [schoolCooldown, setSchoolCooldown] = useState(0);
  const [schoolError, setSchoolError] = useState('');
  const [linkConfirmed,setLinkConfirmed] = useState(false);
  useEffect(()=>{
    if(!linkConfirmed)return;
    const timer=window.setTimeout(()=>setLinkConfirmed(false),2400);
    return ()=>window.clearTimeout(timer);
  },[linkConfirmed]);
  useEffect(() => {
    let active=true;
    setSchool(null); setLinkConfirmed(false); setLinkOpen(false); setSchoolInput(''); setSchoolChallenge(''); setSchoolCode(''); setSchoolError('');
    if (!user) {setSchoolLoading(false); return;}
    if (isSchoolEmail(user.email)) {setSchool({email:user.email,verified:user.emailVerified});setSchoolLoading(false);return;}
    setSchoolLoading(true);
    getSchoolEmail(user).then(value=>{if(active)setSchool(value);}).catch(()=>{if(active)setSchoolError('Could not load your school email.');})
      .finally(()=>{if(active)setSchoolLoading(false);});
    return ()=>{active=false;};
  }, [user?.uid,user?.email,user?.emailVerified]);
  useEffect(()=>{
    if(!schoolCooldown)return;
    const timer=window.setTimeout(()=>setSchoolCooldown(v=>v-1),1000);
    return ()=>window.clearTimeout(timer);
  },[schoolCooldown]);
  async function schoolAction(action:()=>Promise<void>) {
    setBusy(true);setSchoolError('');
    try {await action();}catch(e){setSchoolError(mapAuthError(e));}finally{setBusy(false);}
  }
  async function sendSchoolCode(address = schoolInput) {
    if(!user)return;
    setSchoolChallenge(await requestSchoolEmailCode(user,address));setSchoolCode('');setSchoolCooldown(60);
  }

  useEffect(() => onAuthState(next => {
    setUser(next); setReady(true);
  }), []);

  async function perform(action: () => Promise<void>) {
    setBusy(true); setError('');
    try { await action(); }
    catch (e) { setError(mapAuthError(e)); }
    finally { setBusy(false); }
  }

  const heading = !ready ? 'Account' : user ? 'Account' : 'Sign in';
  return <main className="login">
    <nav className="login__nav" aria-label="Account navigation">
      <div className="login__brand"><span className="login__brand-icon" aria-hidden="true">✳</span> Hilltoppers <span className="login__brand-divider">/</span> Account</div>
      {returnTo && <a className="login__back" href={returnTo} onClick={followReturn}>← {destinations[returnTo]}</a>}
    </nav>
    <div className={`login__container${user ? ' login__container--account' : ' login__container--auth'}`}>
    <header className="login__header"><h1>{heading}</h1>{user ? <p>{user.email}</p> : ready ? <p>Sync your classes across devices.</p> : null}</header>
    {!ready ? <p role="status">Restoring your account…</p> : user ? <div className="account-overview">
      <section className="account-section" aria-labelledby="school-account-heading">
        <h2 id="school-account-heading">Connections</h2>
        <div className="account-school-card">
        <div className="account-connection">
          <span className="account-connection-icon" aria-hidden="true">SJA</span>
          <div className="account-connection-copy">
            <strong>St. Johnsbury Academy email</strong>
            {school?.email && <p>{school.email}</p>}
          </div>
          {isSchoolEmail(user.email) ? <span className="account-school-status">{school?.verified ? 'Verified' : 'Not verified'}</span> :
            <SchoolLinkButton linked={Boolean(school?.email)} confirmed={linkConfirmed} busy={busy || schoolLoading} onClick={()=>{
              if(school?.email) {
                if(!window.confirm(`Unlink ${school.email}?`))return;
                void schoolAction(async()=>{
                  await unlinkSchoolEmail(user);setSchool({email:null,verified:false});setLinkConfirmed(false);
                  setLinkOpen(false);setSchoolChallenge('');setSchoolCode('');setSchoolInput('');
                  window.dispatchEvent(new Event('school-email-linked'));
                });
              } else {setLinkOpen(v=>!v);setSchoolError('');}
            }}/>}
        </div>
        {linkOpen && !school?.email && <form className="login__form account-school-form" onSubmit={event=>{
          event.preventDefault();const address=String(new FormData(event.currentTarget).get('school-email') || schoolInput).trim().toLowerCase();
          void schoolAction(async()=>{
            if(!user)return;
            if(schoolChallenge) {
              const linked=await linkSchoolEmail(user,schoolChallenge,schoolCode);
              setSchool(linked);setLinkConfirmed(true);setLinkOpen(false);setSchoolChallenge('');setSchoolCode('');
              window.dispatchEvent(new Event('school-email-linked'));
            } else {setSchoolInput(address);await sendSchoolCode(address);}
          });
        }}>
          {schoolChallenge ? <>
            <label htmlFor="school-code">Code sent to {schoolInput}</label>
            <CodeInput id="school-code" value={schoolCode} disabled={busy} onChange={setSchoolCode}/>
            <p className="school-delivery-hint">Check Junk or <a href="https://security.microsoft.com/quarantine" target="_blank" rel="noopener noreferrer">Quarantine</a> if you don’t see the email.</p>
          </> : <>
            <label htmlFor="school-email">School email</label>
            <input id="school-email" name="school-email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required disabled={busy} defaultValue={schoolInput} placeholder="you@student.stjacademy.org"/>
          </>}
          <div className="account-school-actions">
            <button type="submit" className="primary" disabled={busy}>{busy ? 'Please wait…' : schoolChallenge ? 'Verify email' : 'Send code'}</button>
            {schoolChallenge && <>
              <button type="button" className="tertiary" disabled={busy || schoolCooldown>0} onClick={()=>void schoolAction(()=>sendSchoolCode())}>{schoolCooldown ? `Resend in ${schoolCooldown}s` : 'Resend code'}</button>
              <button type="button" className="tertiary" disabled={busy} onClick={()=>{setSchoolChallenge('');setSchoolCode('');setSchoolError('');}}>Change email</button>
            </>}
          </div>
        </form>}
        {schoolError && <p role="alert" className="login__error school-link-error">{schoolError}</p>}
        </div>
      </section>
      <div className="account-sign-out-row">
        <button className="danger account-action" disabled={busy} onClick={() => {
          if (!window.confirm('Sign out of Hilltoppers?')) return;
          void perform(async () => { await signOut(); });
        }}>Sign out</button>
      </div>
    </div> : <div className="login__google">
      <button type="button" className="login__google-button" disabled={busy} onClick={() => void perform(async () => {
        await signInWithGoogle();
      })}>
        <GoogleMark/>
        <span>{busy ? 'Signing in…' : 'Sign in with Google'}</span>
      </button>
      {error && <p role="alert" className="login__error">{error}</p>}
    </div>}
    {user && error && <div className="account-status" aria-live="polite"><p role="alert" className="account-error">{error}</p></div>}
  </div></main>;
}
