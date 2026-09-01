import React, { useState } from 'react';
import {
  authAvailable,
  mapAuthError,
  registerWithEmail,
  signInWithApple,
  signInWithEmail,
  signInWithGoogle
} from '../auth';

type Mode = 'signIn' | 'register';

interface Props {
  heading: string;
  blurb?: string;
}

const SignInPanel: React.FC<Props> = ({ heading, blurb }) => {
  const [mode, setMode] = useState<Mode>('signIn');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const available = authAvailable();

  const run = async (action: () => Promise<void>) => {
    if (busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      return;
    }
    void run(() =>
      mode === 'signIn'
        ? signInWithEmail(trimmedEmail, password)
        : registerWithEmail(trimmedEmail, password, name.trim())
    );
  };

  if (!available) {
    return (
      <div className="detail-card center">
        <h1 className="detail-title">{heading}</h1>
        <p className="notice error">
          This site was built without its Firebase settings, so signing in cannot start yet.
        </p>
      </div>
    );
  }

  return (
    <div className="detail-card">
      <h1 className="detail-title">{heading}</h1>
      {blurb ? <p className="muted">{blurb}</p> : null}

      <div className="auth-providers">
        <button
          type="button"
          className="provider-button"
          disabled={busy}
          onClick={() => void run(signInWithGoogle)}
        >
          Continue with Google
        </button>
        <button
          type="button"
          className="provider-button"
          disabled={busy}
          onClick={() => void run(signInWithApple)}
        >
          Continue with Apple
        </button>
      </div>

      <div className="auth-divider">
        <span>or use your email</span>
      </div>

      <form onSubmit={handleSubmit}>
        {mode === 'register' ? (
          <label className="field">
            <span className="field-label">Your name</span>
            <input
              type="text"
              value={name}
              autoComplete="name"
              placeholder="Alex Rivera"
              onChange={(event) => setName(event.target.value)}
            />
            <span className="field-hint">
              Ideas you post show your first name and last initial, nothing more.
            </span>
          </label>
        ) : null}

        <label className="field">
          <span className="field-label">Email</span>
          <input
            type="email"
            value={email}
            required
            autoComplete="email"
            placeholder="you@example.com"
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        <label className="field">
          <span className="field-label">
            Password
            <button
              type="button"
              className="link-button"
              onClick={() => setShowPassword((prev) => !prev)}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </span>
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            required
            minLength={6}
            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
            placeholder={mode === 'register' ? 'At least 6 characters' : ''}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        {error ? <p className="notice error">{error}</p> : null}

        <button type="submit" className="pill-button full" disabled={busy}>
          {busy ? 'Working…' : mode === 'signIn' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <p className="muted small auth-switch">
        {mode === 'signIn' ? 'No account yet?' : 'Already have an account?'}{' '}
        <button
          type="button"
          className="link-button"
          onClick={() => {
            setMode(mode === 'signIn' ? 'register' : 'signIn');
            setError(null);
          }}
        >
          {mode === 'signIn' ? 'Create one' : 'Sign in'}
        </button>
      </p>

      <p className="muted small">
        Use the same account as the extension and your votes stay together.
      </p>
    </div>
  );
};

export default SignInPanel;
