import React, { useEffect, useState } from 'react';
import { FirebaseError } from 'firebase/app';
import { onAuthState, registerWithEmail, reloadCurrentUser, sendVerificationEmail,
  signInWithEmail, signOut, resetPassword, redeemEmailCode, completeEmailVerification, completePasswordReset, isSchoolEmail, getSchoolEmail, requestSchoolEmailCode, linkSchoolEmail, unlinkSchoolEmail, type AuthUser } from '../firebase/auth';
import './login.css';
import CodeInput from './CodeInput';
import SchoolLinkButton from './SchoolLinkButton';

type Mode = 'signIn' | 'register' | 'reset';
const destinations: Record<string, string> = {
  'class-settings.html': 'Class settings', 'toppings.html': 'Topping Bar'
};

function mapAuthError(error: unknown): string {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case 'auth/invalid-email':
        return 'The email address is not valid. Please check and try again.';
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Incorrect email or password. Please try again.';
      case 'auth/user-disabled':
        return 'This account has been disabled. Contact support if you believe this is a mistake.';
      case 'auth/user-not-found':
        return 'No account exists with that email. Create a new account or try another email address.';
      case 'auth/email-already-in-use':
        return 'An account already exists with that email. Try signing in instead.';
      case 'auth/weak-password':
        return 'Your password must be at least 6 characters long.';
      case 'auth/network-request-failed':
        return 'Network error. Check your connection and try again.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please wait a moment before trying again.';
      case 'auth/popup-closed-by-user':
        return 'The sign-in window was closed before completing the process.';
      case 'auth/cancelled-popup-request':
        return 'Another sign-in request is already in progress. Please try again.';
      case 'auth/operation-not-allowed':
        return 'This sign-in method is not available. Contact support for assistance.';
      default:
        return `Could not complete this request (${error.code}). Please try again.`;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Unable to sign in right now. Please try again.';
}

function nameFromEmail(address: string): string {
  return address.split('@')[0].split(/[._-]+/).filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

export default function Login({ returnPage, onNavigate }: { returnPage?: string; onNavigate?: (page: string) => void }) {
  const requested = returnPage ?? new URLSearchParams(location.search).get('returnTo') ?? '';
  const returnTo = Object.prototype.hasOwnProperty.call(destinations, requested) ? requested : '';
  const followReturn = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (onNavigate) { event.preventDefault(); onNavigate(returnTo); }
  };
  const [user, setUser] = useState<AuthUser | null>(null);
  const [, refreshView] = useState(0);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [resetSent, setResetSent] = useState(false);
  const [challengeId, setChallengeId] = useState('');
  const [code, setCode] = useState('');
  const [resetAction, setResetAction] = useState('');
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
  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown(value => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  useEffect(() => {
    if (!user || user.emailVerified) return;
    const refresh = () => {
      void reloadCurrentUser().then(next => {
        if (next?.emailVerified) { setUser(next); refreshView(v => v + 1); setMessage('Email verified.'); }
      }).catch(() => {});
    };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [user?.uid, user?.emailVerified]);

  function switchMode(next: Mode) {
    setMode(next); setChallengeId(''); setCode(''); setResetAction(''); setShowPassword(false); setResetSent(false); setMessage(''); setError('');
  }
  async function perform(action: () => Promise<void>) {
    setBusy(true); setError(''); setMessage('');
    try { await action(); }
    catch (e) { setError(mapAuthError(e)); }
    finally { setBusy(false); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    // Read the DOM before rendering busy state: password managers may fill without input events.
    const fields = new FormData(event.currentTarget as HTMLFormElement);
    const submittedEmail = String(fields.get('username') ?? '').trim();
    const submittedPassword = String(fields.get('password') ?? '');
    setEmail(submittedEmail);
    await perform(async () => {
      if (mode === 'reset') {
        setChallengeId(await resetPassword(submittedEmail)); setCode('');
        setResetSent(true);
        setCooldown(60);
      } else if (mode === 'register') {
        const result = await registerWithEmail(submittedEmail, submittedPassword, nameFromEmail(submittedEmail));
        setChallengeId(await sendVerificationEmail(result.user)); setCode(''); setCooldown(60);
      } else {
        await signInWithEmail(submittedEmail, submittedPassword);
        setMessage('');
      }
    });
  }
  function codeForm(verifying: boolean) {
    return <form className="login__form login__code-form" onSubmit={event => {
      event.preventDefault(); void perform(async () => {
        const action = await redeemEmailCode(challengeId, code, verifying ? user : null);
        if (verifying) {
          await completeEmailVerification(action); setChallengeId(''); setCode(''); refreshView(v=>v+1);
        } else { setResetAction(action); setCode(''); }
      });
    }}>
      <label htmlFor="email-code">Email code</label>
      <input id="email-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} disabled={busy} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/>
      {!verifying && error && <p role="alert" className="login__error">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? 'Please wait…' : verifying ? 'Verify email' : 'Continue'}</button>
      <button type="button" className="tertiary" disabled={busy || cooldown>0} onClick={()=>void perform(async()=>{
        setChallengeId(verifying ? await sendVerificationEmail(user) : await resetPassword(email));
        setCode(''); setCooldown(60);
      })}>{cooldown ? `Send again in ${cooldown}s` : 'Resend email'}</button>
    </form>;
  }
  const heading = !ready ? 'Account' : user ? 'Account' : mode === 'reset' ? resetAction ? 'New password' : resetSent ? 'Check your email' : 'Reset password' : mode === 'register' ? 'Create an account' : 'Sign in';
  return <main className="login">
    <nav className="login__nav" aria-label="Account navigation">
      <div className="login__brand"><span className="login__brand-icon" aria-hidden="true">✳</span> Hilltoppers <span className="login__brand-divider">/</span> Account</div>
      {returnTo && <a className="login__back" href={returnTo} onClick={followReturn}>← {destinations[returnTo]}</a>}
    </nav>
    <div className={`login__container${user ? ' login__container--account' : ' login__container--auth'}`}>
    <header className="login__header"><h1>{heading}</h1>{user ? <p>{user.email}</p> : ready && mode === 'reset' && !resetSent ? <p>Get a reset link and code.</p> : null}</header>
    {!ready ? <p role="status">Restoring your account…</p> : user ? <div className="account-overview">
      {!user.emailVerified && <section className="account-section">
        <h2>Verify your email</h2>
        {challengeId ? codeForm(true) : <button className="secondary" disabled={busy || cooldown > 0} onClick={() => void perform(async () => {
          setChallengeId(await sendVerificationEmail(user)); setCode(''); setCooldown(60);
        })}>{cooldown ? `Send again in ${cooldown}s` : 'Send verification email'}</button>}
      </section>}
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
          void perform(async () => {
            await signOut(); switchMode('signIn');
          });
        }}>Sign out</button>
      </div>
    </div> : resetSent ? <div className="login__reset-success">
      {resetAction ? <form id="reset-password-form" method="post" autoComplete="on" className="login__form" onSubmit={event => {
        event.preventDefault();
        const newPassword = String(new FormData(event.currentTarget).get('password') ?? '');
        void perform(async () => {
          await completePasswordReset(resetAction, newPassword); switchMode('signIn');
        });
      }}>
        <input type="hidden" name="username" autoComplete="username" value={email}/>
        <label htmlFor="new-password">New password</label>
        <input id="new-password" name="password" type="password" autoComplete="new-password" required minLength={6} defaultValue="" disabled={busy}/>
        {error && <p role="alert" className="login__error">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? 'Please wait…' : 'Save password'}</button>
      </form> : codeForm(false)}
      <button type="button" className="tertiary" disabled={busy} onClick={() => switchMode('signIn')}>Back to sign in</button>
    </div> : <form key={mode} id={`${mode}-form`} method="post" autoComplete="on" className="login__form" onSubmit={submit}>
      <label htmlFor="login-email">Email</label>
      <input id="login-email" name="username" type="email" autoCapitalize="none" spellCheck={false} required defaultValue={email} onChange={e => { setEmail(e.target.value); setError(''); }} autoComplete="username" disabled={busy}/>
      {mode !== 'reset' && <>
        <label htmlFor="login-password">Password{mode === 'register' && <span className="login__hint">At least 6 characters</span>}</label>
        <div className="login__password-field">
          <input id="login-password" name="password" aria-label="Password" type={showPassword ? 'text' : 'password'} required minLength={mode === 'register' ? 6 : undefined} defaultValue="" onChange={() => setError('')} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} disabled={busy}/>
          <button type="button" className="login__password-toggle" disabled={busy} aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(v => !v)}>{showPassword ? 'Hide' : 'Show'}</button>
        </div>
      </>}
      {error && <p role="alert" className="login__error">{error}</p>}
      <button className="primary login__submit" disabled={busy || (mode === 'reset' && cooldown > 0)}>{busy ? 'Please wait…' : mode === 'reset' ? cooldown ? `Send again in ${cooldown}s` : 'Send reset link' : mode === 'register' ? 'Create account' : 'Sign in'}</button>
      <div className="login__links">
        {mode === 'reset' && error === 'No account found with this email.' && <button type="button" className="tertiary" disabled={busy} onClick={() => switchMode('register')}>Create an account</button>}
        {mode === 'signIn' && <button type="button" className="tertiary" disabled={busy} onClick={() => switchMode('reset')}>Forgot password?</button>}
        <button type="button" className="tertiary" disabled={busy} onClick={() => switchMode(mode === 'signIn' ? 'register' : 'signIn')}>{mode === 'signIn' ? 'Create an account' : 'Back to sign in'}</button>
      </div>
    </form>}
    {user && (error || message) && <div className="account-status" aria-live="polite">{error ? <p role="alert" className="account-error">{error}</p> : <p role="status">{message}</p>}</div>}
  </div></main>;
}
