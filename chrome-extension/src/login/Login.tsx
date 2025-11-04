import React, { useEffect, useMemo, useState } from 'react';
import { FirebaseError } from 'firebase/app';
import {
  onAuthState,
  registerWithEmail,
  reloadCurrentUser,
  sendVerificationEmail,
  signInWithApple,
  signInWithEmail,
  signInWithGoogle,
  signOut as signOutUser
} from '../firebase/auth';
import type { AuthUser } from '../firebase/auth';
import { logScreenView } from '../firebase/analytics';
import './login.css';

type FeedbackType = 'success' | 'error' | 'info' | 'warning';

interface Feedback {
  type: FeedbackType;
  message: string;
}

type AuthMode = 'signIn' | 'register';

function resolveExtensionUrl(path: string): string {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(path);
  }
  return path;
}

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
      case 'auth/popup-closed-by-user':
        return 'The sign-in window was closed before completing the process.';
      case 'auth/cancelled-popup-request':
        return 'Another sign-in request is already in progress. Please try again.';
      case 'auth/operation-not-allowed':
        return 'This sign-in method is not available. Contact support for assistance.';
      default:
        return `Unable to sign in right now (${error.code}). Please try again.`;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Unable to sign in right now. Please try again.';
}

const Login: React.FC = () => {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  const classSettingsUrl = useMemo(() => resolveExtensionUrl('class-settings.html'), []);

  useEffect(() => {
    void logScreenView('Login');

    const unsubscribe = onAuthState((user) => {
      setAuthUser(user);
      setAuthInitialized(true);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const needsEmailVerification = useMemo(() => {
    if (!authUser) {
      return false;
    }
    if (authUser.emailVerified) {
      return false;
    }
    const providers = authUser.providerData?.map((entry) => entry?.providerId).filter(Boolean) as string[];
    return providers.includes('password');
  }, [authUser]);

  useEffect(() => {
    if (!needsEmailVerification) {
      return undefined;
    }

    let cancelled = false;

    const refreshStatus = async () => {
      try {
        const updated = await reloadCurrentUser();
        if (cancelled) {
          return;
        }
        if (updated) {
          setAuthUser(updated);
          if (updated.emailVerified) {
            setFeedback({ type: 'success', message: 'Email verified! Opening settings…' });
          }
        }
      } catch (error) {
        console.warn('[login] Auto refresh verification failed', error);
      }
    };

    const handleFocus = () => {
      void refreshStatus();
    };

    window.addEventListener('focus', handleFocus);
    void refreshStatus();

    return () => {
      cancelled = true;
      window.removeEventListener('focus', handleFocus);
    };
  }, [needsEmailVerification]);

  useEffect(() => {
    if (!authInitialized || !authUser || needsEmailVerification || redirecting) {
      return;
    }

    setRedirecting(true);
    setFeedback({ type: 'success', message: 'Signed in successfully. Opening settings…' });
    const timeout = window.setTimeout(() => {
      if (typeof window !== 'undefined') {
        window.location.href = classSettingsUrl;
      }
    }, 1200);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [authInitialized, authUser, needsEmailVerification, redirecting, classSettingsUrl]);

  const handleOAuth = async (provider: 'google' | 'apple') => {
    if (busy) {
      return;
    }
    setFeedback(null);
    setBusy(true);
    try {
      if (provider === 'google') {
        await signInWithGoogle();
      } else {
        await signInWithApple();
      }
      setFeedback({ type: 'success', message: 'Signed in successfully.' });
    } catch (error) {
      console.error('[login] OAuth sign-in failed', error);
      setFeedback({ type: 'error', message: mapAuthError(error) });
    } finally {
      setBusy(false);
    }
  };

  const handleEmailSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) {
      return;
    }

    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();
    const trimmedDisplayName = displayName.trim();

    if (!trimmedEmail || !trimmedPassword) {
      setFeedback({ type: 'error', message: 'Email and password are required.' });
      return;
    }

    setBusy(true);
    setFeedback(null);

    try {
      if (authMode === 'register') {
        const credential = await registerWithEmail(trimmedEmail, trimmedPassword, trimmedDisplayName || undefined);
        const createdUser = credential.user;
        setFeedback({
          type: 'info',
          message: 'Account created. We just sent a verification email — please check your inbox.'
        });
        try {
          await sendVerificationEmail(createdUser);
        } catch (error) {
          console.error('[login] Failed to send verification email', error);
          setFeedback({
            type: 'error',
            message: 'Account created, but the verification email could not be sent. Please try resending.'
          });
        }
      } else {
        const credential = await signInWithEmail(trimmedEmail, trimmedPassword);
        if (credential.user && !credential.user.emailVerified) {
          setFeedback({
            type: 'warning',
            message: 'Signed in. Please verify your email to finish setting up syncing.'
          });
        } else {
          setFeedback({ type: 'success', message: 'Signed in successfully.' });
        }
      }
      setPassword('');
    } catch (error) {
      console.error('[login] Email auth failed', error);
      setFeedback({ type: 'error', message: mapAuthError(error) });
    } finally {
      setBusy(false);
    }
  };

  const handleResendVerification = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      await sendVerificationEmail();
      setFeedback({ type: 'info', message: 'Verification email sent. Please check your inbox.' });
    } catch (error) {
      console.error('[login] Resend verification failed', error);
      setFeedback({ type: 'error', message: mapAuthError(error) });
    } finally {
      setBusy(false);
    }
  };

  const handleRefreshVerification = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const updated = await reloadCurrentUser();
      if (updated) {
        setAuthUser(updated);
      }
      if (updated?.emailVerified) {
        setFeedback({ type: 'success', message: 'Email verified! Opening settings…' });
        if (!redirecting) {
          setRedirecting(true);
          if (typeof window !== 'undefined') {
            window.location.href = classSettingsUrl;
          }
        }
      } else {
        setFeedback({
          type: 'warning',
          message: 'We still cannot confirm the verification. Click the link in your email, then try again.'
        });
      }
    } catch (error) {
      console.error('[login] Refresh verification failed', error);
      setFeedback({ type: 'error', message: mapAuthError(error) });
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      await signOutUser();
      setFeedback({ type: 'info', message: 'Signed out. You can still browse settings locally.' });
    } catch (error) {
      console.error('[login] Sign-out failed', error);
      setFeedback({ type: 'error', message: mapAuthError(error) });
    } finally {
      setBusy(false);
    }
  };

  const openSettings = () => {
    if (typeof window !== 'undefined') {
      window.location.href = classSettingsUrl;
    }
  };

  const toggleMode = () => {
    setAuthMode((prev) => (prev === 'signIn' ? 'register' : 'signIn'));
    setFeedback(null);
  };

  return (
    <main className="login">
      <div className="login__container" role="main">
        <header className="login__header">
          <h1>Sign in to Hilltoppers</h1>
          <p>Sync your schedule and class preferences across every device.</p>
        </header>

        {feedback ? (
          <div className={`login__message login__message--${feedback.type}`} role="alert">
            {feedback.message}
          </div>
        ) : null}

        {authUser && needsEmailVerification ? (
          <div className="login__notice login__notice--warning" role="status" aria-live="polite">
            <p>Your email is not verified yet. Check your inbox for a message from Hilltoppers and click the verification link.</p>
            <div className="login__notice-actions">
              <button type="button" className="secondary" onClick={handleResendVerification} disabled={busy}>
                Resend verification email
              </button>
              <button type="button" className="tertiary" onClick={handleRefreshVerification} disabled={busy}>
                I&apos;ve verified my email
              </button>
            </div>
          </div>
        ) : null}

        {authUser && !needsEmailVerification ? (
          <div className="login__notice login__notice--info" role="status" aria-live="polite">
            <p>You&apos;re signed in as <strong>{identityLabel}</strong>.</p>
          </div>
        ) : null}

        <div className="login__content">
          <div className="login__oauth">
            <button type="button" className="primary" onClick={() => void handleOAuth('google')} disabled={busy}>
              Continue with Google
            </button>
            <button type="button" className="secondary" onClick={() => void handleOAuth('apple')} disabled={busy}>
              Continue with Apple
            </button>
          </div>

          <div className="login__divider">
            <span>or</span>
          </div>

          <form className="login__form" onSubmit={handleEmailSubmit}>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
                disabled={busy}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                required
                disabled={busy}
              />
            </label>
            {authMode === 'register' ? (
              <label>
                Display name (optional)
                <input
                  type="text"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  autoComplete="name"
                  disabled={busy}
                />
              </label>
            ) : null}
            <button type="submit" className="primary" disabled={busy}>
              {authMode === 'register' ? 'Create account' : 'Sign in with email'}
            </button>
            <button type="button" className="tertiary" onClick={toggleMode} disabled={busy}>
              {authMode === 'register' ? 'Have an account? Sign in' : 'Need an account? Register'}
            </button>
          </form>
        </div>

        <footer className="login__footer">
          <button type="button" className="login__footer-button" onClick={openSettings} disabled={busy && redirecting}>
            Open settings
          </button>
          {authUser ? (
            <button type="button" className="login__footer-button secondary" onClick={handleSignOut} disabled={busy}>
              Sign out
            </button>
          ) : null}
        </footer>
      </div>
    </main>
  );
};

export default Login;

