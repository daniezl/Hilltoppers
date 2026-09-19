import React, { useEffect, useState } from 'react';
import { FirebaseError } from 'firebase/app';
import { onAuthState, registerWithEmail, reloadCurrentUser, sendVerificationEmail,
  signInWithEmail, signOut, resetPassword, type AuthUser } from '../firebase/auth';
import './login.css';

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
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);

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
    setMode(next); setPassword(''); setMessage(''); setError('');
  }
  async function perform(action: () => Promise<void>) {
    setBusy(true); setError(''); setMessage('');
    try { await action(); }
    catch (e) { setError(mapAuthError(e)); }
    finally { setBusy(false); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await perform(async () => {
      if (mode === 'reset') {
        await resetPassword(email);
        setMessage('If an account uses this email, you will receive a password reset link. Check your spam folder too.');
        setCooldown(60);
      } else if (mode === 'register') {
        const result = await registerWithEmail(email.trim(), password, nameFromEmail(email.trim()));
        setPassword('');
        await sendVerificationEmail(result.user);
        setMessage('Check your inbox to verify your email.'); setCooldown(60);
      } else {
        await signInWithEmail(email.trim(), password);
        setPassword('');
        setMessage('You are signed in.');
      }
    });
  }
  const heading = !ready ? 'Account' : user ? 'Account' : mode === 'reset' ? 'Reset your password' : mode === 'register' ? 'Create an account' : 'Sign in to Hilltoppers';
  return <main className="login">
    <nav className="login__nav" aria-label="Account navigation">
      <div className="login__brand"><span className="login__brand-icon" aria-hidden="true">✳</span> Hilltoppers <span className="login__brand-divider">/</span> Account</div>
      {returnTo && <a className="login__back" href={returnTo} onClick={followReturn}>← {destinations[returnTo]}</a>}
    </nav>
    <div className={`login__container${user ? ' login__container--account' : ''}`}>
    <header className="login__header"><h1>{heading}</h1><p>{user ? user.email : mode === 'reset' ? 'We will email you a link to choose a new password.' : 'One account for your settings and Toppings.'}</p></header>
    {!ready ? <p role="status">Restoring your account…</p> : user ? <div className="account-overview">
      <section className="account-section" aria-labelledby="school-account-heading">
        <h2 id="school-account-heading">Connections</h2>
        <div className="account-connection">
          <span className="account-connection-icon" aria-hidden="true">SJA</span>
          <div className="account-connection-copy">
            <strong>St. Johnsbury Academy email</strong>
            <p>Link your @student.stjacademy.org or @stjacademy.org account.</p>
          </div>
          <button className="secondary account-action" disabled={busy} onClick={() => {
            setError(''); setMessage('Microsoft 365 linking will be available here.');
          }}>Link email</button>
        </div>
      </section>
      <div className="account-sign-out-row">
        <button className="danger account-action" disabled={busy} onClick={() => {
          if (!window.confirm('Sign out of Hilltoppers?')) return;
          void perform(async () => {
            await signOut(); setPassword(''); setMode('signIn'); setMessage('Signed out. Your settings remain on this browser.');
          });
        }}>Sign out</button>
      </div>
    </div> : <form className="login__form" onSubmit={submit}>
      <label>Email<input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" disabled={busy}/></label>
      {mode !== 'reset' && <label>Password<div className="login__password-field">
        <input aria-label="Password" type={showPassword ? 'text' : 'password'} required minLength={mode === 'register' ? 6 : undefined} value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} disabled={busy}/>
        <button type="button" className="login__password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(v => !v)}>{showPassword ? 'Hide' : 'Show'}</button>
      </div></label>}
      <button className="primary" disabled={busy || (mode === 'reset' && cooldown > 0)}>{busy ? 'Please wait…' : mode === 'reset' ? cooldown ? `Send again in ${cooldown}s` : 'Send reset link' : mode === 'register' ? 'Create account' : 'Sign in'}</button>
      {mode === 'signIn' && <button type="button" className="tertiary" disabled={busy} onClick={() => switchMode('reset')}>Forgot password?</button>}
      <button type="button" className="tertiary" disabled={busy} onClick={() => switchMode(mode === 'signIn' ? 'register' : 'signIn')}>{mode === 'signIn' ? 'Create an account' : 'Back to sign in'}</button>
    </form>}
    <div className="account-status" aria-live="polite">{error ? <p role="alert" className="account-error">{error}</p> : <p role="status">{message}</p>}</div>
  </div></main>;
}
