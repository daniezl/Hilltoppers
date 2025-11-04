import React, { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_BLOCK_NAMES,
  type BlockKey,
  type BlockPreferenceRecord,
  createEmptyPreferences,
  loadBlockPreferences,
  saveBlockPreferences
} from '../storage/blockPreferences';
import {
  DEFAULT_SCHEDULE_PREFERENCES,
  loadSchedulePreferences,
  saveSchedulePreferences,
  type SchedulePreferences
} from '../storage/schedulePreferences';
import {
  onAuthState,
  registerWithEmail,
  signInWithApple,
  signInWithEmail,
  signInWithGoogle,
  signOut as signOutUser,
  reloadCurrentUser,
  sendVerificationEmail
} from '../firebase/auth';
import type { AuthUser } from '../firebase/auth';
import { logClassSettingsReset, logPreferenceSaved, logScreenView } from '../firebase/analytics';

interface SaveState {
  status: 'idle' | 'saving' | 'success' | 'error';
  message: string;
}

const INITIAL_SAVE_STATE: SaveState = {
  status: 'idle',
  message: ''
};

const ClassSettings: React.FC = () => {
  const [blockPrefs, setBlockPrefs] = useState<BlockPreferenceRecord>(createEmptyPreferences());
  const [schedulePrefs, setSchedulePrefs] = useState<SchedulePreferences>(DEFAULT_SCHEDULE_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>(INITIAL_SAVE_STATE);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [authPending, setAuthPending] = useState(false);
  const [authMessage, setAuthMessage] = useState('');
  const [authError, setAuthError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [emailMode, setEmailMode] = useState<'signIn' | 'register'>('signIn');

  useEffect(() => {
    void logScreenView('ClassSettings');

    const unsubscribe = onAuthState((user) => {
      setAuthUser(user);
      setAuthInitialized(true);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authInitialized) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setSaveState(INITIAL_SAVE_STATE);

    (async () => {
      try {
        const [nextBlocks, nextSchedule] = await Promise.all([
          loadBlockPreferences(),
          loadSchedulePreferences()
        ]);
        if (!cancelled) {
          setBlockPrefs(nextBlocks);
          setSchedulePrefs(nextSchedule);
        }
      } catch (error) {
        console.error('[class-settings] Failed to load data', error);
        if (!cancelled) {
          setSaveState({ status: 'error', message: 'Unable to load saved settings.' });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authInitialized, authUser]);

  useEffect(() => {
    if (saveState.status === 'success' || saveState.status === 'error') {
      const timeout = window.setTimeout(() => {
        setSaveState((prev) => (prev.status === 'saving' ? prev : INITIAL_SAVE_STATE));
      }, 4000);
      return () => window.clearTimeout(timeout);
    }
    return () => {};
  }, [saveState.status]);

  const blockRows = useMemo(() => (Object.keys(DEFAULT_BLOCK_NAMES) as BlockKey[]), []);

  const identityLabel = useMemo(() => {
    if (!authUser) {
      return '';
    }
    return authUser.displayName || authUser.email || authUser.uid;
  }, [authUser]);

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
    if (!authUser) {
      return;
    }
    if (needsEmailVerification) {
      setAuthMessage((prev) => {
        if (prev) {
          return prev;
        }
        const emailLabel = authUser.email ? ` (${authUser.email})` : '';
        return `Please verify your email${emailLabel} to sync preferences.`;
      });
    }
  }, [authUser, needsEmailVerification]);

  const resetAuthMessages = () => {
    setAuthMessage('');
    setAuthError('');
  };

  const handleBlockNameChange = (key: BlockKey, value: string) => {
    setBlockPrefs((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        name: value
      }
    }));
  };

  const handleBlockToggle = (key: BlockKey, field: 'showOnGreen' | 'showOnWhite') => {
    setBlockPrefs((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: !prev[key][field]
      }
    }));
  };

  const handleLunchChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = Number(event.target.value);
    setSchedulePrefs((prev) => ({ ...prev, lunchPeriod: value }));
  };

  const handleReset = () => {
    setBlockPrefs(createEmptyPreferences());
    setSchedulePrefs(DEFAULT_SCHEDULE_PREFERENCES);
    setSaveState({ status: 'idle', message: '' });
    void logClassSettingsReset();
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (needsEmailVerification) {
      setSaveState({
        status: 'error',
        message: 'Please verify your email before saving your preferences.'
      });
      return;
    }
    setSaveState({ status: 'saving', message: 'Saving…' });

    try {
      await Promise.all([
        saveBlockPreferences(blockPrefs),
        saveSchedulePreferences(schedulePrefs)
      ]);
      if (typeof chrome !== 'undefined') {
        chrome.runtime?.sendMessage?.({ type: 'preferencesUpdated' });
      }
      setSaveState({ status: 'success', message: 'Saved successfully.' });
      void logPreferenceSaved('class_settings');
    } catch (error) {
      console.error('[class-settings] Failed to save settings', error);
      setSaveState({ status: 'error', message: 'Failed to save changes.' });
    }
  };

  const handleSignIn = async (provider: 'google' | 'apple') => {
    resetAuthMessages();
    setAuthPending(true);
    try {
      if (provider === 'google') {
        await signInWithGoogle();
      } else {
        await signInWithApple();
      }
      setAuthMessage('Signed in successfully.');
    } catch (error) {
      console.error('[class-settings] OAuth sign-in failed', error);
      const message = error instanceof Error ? error.message : 'Unable to sign in right now.';
      setAuthError(message);
    } finally {
      setAuthPending(false);
    }
  };

  const handleEmailSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    resetAuthMessages();
    setAuthPending(true);
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();
    const trimmedDisplayName = displayName.trim();

    try {
      if (!trimmedEmail || !trimmedPassword) {
        setAuthError('Email and password are required.');
        return;
      }

      if (emailMode === 'register') {
        const credential = await registerWithEmail(trimmedEmail, trimmedPassword, trimmedDisplayName || undefined);
        const registeredUser = credential.user;
        if (registeredUser && !registeredUser.emailVerified) {
          try {
            await sendVerificationEmail(registeredUser);
            const targetEmail = registeredUser.email ?? 'your email address';
            setAuthMessage(`Account created. Verification email sent to ${targetEmail}.`);
          } catch (sendError) {
            console.error('[class-settings] Failed to send verification email', sendError);
            setAuthError('Account created, but failed to send verification email. Please try resending.');
          }
        } else {
          setAuthMessage('Account created. You are now signed in.');
        }
      } else {
        const credential = await signInWithEmail(trimmedEmail, trimmedPassword);
        if (credential.user && !credential.user.emailVerified) {
          setAuthMessage('Signed in. Please verify your email before making changes.');
        } else {
          setAuthMessage('Signed in successfully.');
        }
      }
      setPassword('');
    } catch (error) {
      console.error('[class-settings] Email auth failed', error);
      const message = error instanceof Error ? error.message : 'Unable to complete request.';
      setAuthError(message);
    } finally {
      setAuthPending(false);
    }
  };

  const handleSignOut = async () => {
    resetAuthMessages();
    setAuthPending(true);
    try {
      await signOutUser();
      setAuthMessage('Signed out. Preferences will now stay on this device only.');
    } catch (error) {
      console.error('[class-settings] Sign-out failed', error);
      const message = error instanceof Error ? error.message : 'Unable to sign out right now.';
      setAuthError(message);
    } finally {
      setAuthPending(false);
    }
  };

  const handleResendVerification = async () => {
    resetAuthMessages();
    setAuthPending(true);
    try {
      await sendVerificationEmail();
      setAuthMessage('Verification email sent. Please check your inbox.');
    } catch (error) {
      console.error('[class-settings] Failed to resend verification email', error);
      const message = error instanceof Error ? error.message : 'Unable to resend verification email right now.';
      setAuthError(message);
    } finally {
      setAuthPending(false);
    }
  };

  const handleRefreshVerification = async () => {
    resetAuthMessages();
    setAuthPending(true);
    try {
      const updated = await reloadCurrentUser();
      if (updated) {
        setAuthUser(updated);
      }
      if (updated?.emailVerified) {
        setAuthMessage('Thank you! Your email is verified.');
      } else {
        setAuthError('We still have not detected a verified email. Please click the link in your inbox, then try again.');
      }
    } catch (error) {
      console.error('[class-settings] Failed to refresh verification status', error);
      const message = error instanceof Error ? error.message : 'Unable to refresh verification status right now.';
      setAuthError(message);
    } finally {
      setAuthPending(false);
    }
  };

  const toggleEmailMode = () => {
    setEmailMode((prev) => (prev === 'signIn' ? 'register' : 'signIn'));
    resetAuthMessages();
  };

  return (
    <main className="class-settings">
      <section className="class-settings__account" aria-labelledby="account-heading">
        <div className="class-settings__account-header">
          <h2 id="account-heading">Account</h2>
          <p>Sign in to sync your schedule and class preferences across devices.</p>
        </div>
        {!authInitialized ? (
          <p className="class-settings__account-status">Checking sign-in status…</p>
        ) : authUser ? (
          <div className="class-settings__account-card">
            <p className="class-settings__account-summary">
              Signed in as <strong>{identityLabel}</strong>
            </p>
            {authUser.email ? <p className="class-settings__account-email">{authUser.email}</p> : null}
            <button type="button" className="secondary" onClick={handleSignOut} disabled={authPending}>
              Sign out
            </button>
          </div>
        ) : (
          <div className="class-settings__signin-grid">
            <div className="class-settings__oauth-buttons">
              <button type="button" className="primary" onClick={() => void handleSignIn('google')} disabled={authPending}>
                Continue with Google
              </button>
              <button type="button" className="secondary" onClick={() => void handleSignIn('apple')} disabled={authPending}>
                Continue with Apple
              </button>
            </div>
            <form className="class-settings__email-auth" onSubmit={handleEmailSubmit}>
              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={emailMode === 'register' ? 'new-password' : 'current-password'}
                  required
                />
              </label>
              {emailMode === 'register' ? (
                <label>
                  Display name (optional)
                  <input
                    type="text"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    autoComplete="name"
                  />
                </label>
              ) : null}
              <div className="class-settings__email-actions">
                <button type="submit" className="primary" disabled={authPending}>
                  {emailMode === 'register' ? 'Create account' : 'Sign in with email'}
                </button>
                <button type="button" className="tertiary" onClick={toggleEmailMode} disabled={authPending}>
                  {emailMode === 'register' ? 'Have an account? Sign in' : 'Need an account? Register'}
                </button>
              </div>
            </form>
          </div>
        )}
        {authUser && needsEmailVerification ? (
          <div className="class-settings__verification" role="status" aria-live="polite">
            <p className="class-settings__account-status class-settings__account-status--warning">
              Please verify your email to sync your schedule and classes.
            </p>
            <div className="class-settings__verification-actions">
              <button type="button" className="secondary" onClick={handleResendVerification} disabled={authPending}>
                Resend verification email
              </button>
              <button type="button" className="tertiary" onClick={handleRefreshVerification} disabled={authPending}>
                I&apos;ve verified my email
              </button>
            </div>
          </div>
        ) : null}
        {authMessage ? <p className="class-settings__account-status class-settings__account-status--success">{authMessage}</p> : null}
        {authError ? (
          <p className="class-settings__account-status class-settings__account-status--error" role="alert">
            {authError}
          </p>
        ) : null}
      </section>

      <header className="class-settings__header">
        <div>
          <h1>Class & Schedule Settings</h1>
          <p>Rename blocks, pick your lunch period, and choose how classes show up on Green and White days.</p>
        </div>
        <div className="class-settings__header-actions">
          <button type="button" className="secondary" onClick={handleReset} disabled={loading || saveState.status === 'saving'}>
            Reset to Defaults
          </button>
          <button
            type="submit"
            form="class-settings-form"
            className="primary"
            disabled={loading || saveState.status === 'saving' || needsEmailVerification}
          >
            {saveState.status === 'saving' ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </header>

      {saveState.message ? (
        <div className={`class-settings__status class-settings__status--${saveState.status}`}>
          {saveState.message}
        </div>
      ) : null}

      {loading ? (
        <div className="class-settings__loading">Loading…</div>
      ) : (
        <form id="class-settings-form" className="class-settings__form" onSubmit={handleSave}>
          <section className="class-settings__panel class-settings__panel--schedule">
            <h2>Daily Schedule</h2>
            <div className="class-settings__field">
              <label htmlFor="lunch-period">Lunch period</label>
              <select
                id="lunch-period"
                value={schedulePrefs.lunchPeriod}
                onChange={handleLunchChange}
                disabled={saveState.status === 'saving' || needsEmailVerification}
              >
                {[1, 2, 3, 4, 5].map((period) => (
                  <option key={period} value={period}>
                    {period}
                  </option>
                ))}
              </select>
            </div>
            <p className="class-settings__hint">Your lunch selection and classes sync automatically when you are signed in.</p>
            {needsEmailVerification ? (
              <p className="class-settings__hint class-settings__hint--warning">Verify your email to enable syncing and saving changes.</p>
            ) : null}
          </section>

          <section className="class-settings__panel">
            <h2>Class Blocks</h2>
            <div className="class-settings__table" role="table" aria-label="Class block preferences">
              <div className="class-settings__table-row class-settings__table-row--header" role="row">
                <div role="columnheader">Block</div>
                <div role="columnheader">Course name</div>
                <div role="columnheader">Green day</div>
                <div role="columnheader">White day</div>
              </div>
              {blockRows.map((key) => {
                const pref = blockPrefs[key];
                return (
                  <div key={key} className="class-settings__table-row" role="row">
                    <div role="cell" className="class-settings__table-label">
                      <strong>{DEFAULT_BLOCK_NAMES[key]}</strong>
                    </div>
                    <div role="cell" className="class-settings__table-input">
                      <input
                        type="text"
                        value={pref.name}
                        placeholder={DEFAULT_BLOCK_NAMES[key]}
                        onChange={(event) => handleBlockNameChange(key, event.target.value)}
                        aria-label={`Course name for ${DEFAULT_BLOCK_NAMES[key]}`}
                      />
                    </div>
                    <div role="cell" className="class-settings__table-toggle">
                      <label>
                        <input
                          type="checkbox"
                          checked={pref.showOnGreen}
                          onChange={() => handleBlockToggle(key, 'showOnGreen')}
                          aria-label={`Show ${DEFAULT_BLOCK_NAMES[key]} on Green days`}
                        />
                      </label>
                    </div>
                    <div role="cell" className="class-settings__table-toggle">
                      <label>
                        <input
                          type="checkbox"
                          checked={pref.showOnWhite}
                          onChange={() => handleBlockToggle(key, 'showOnWhite')}
                          aria-label={`Show ${DEFAULT_BLOCK_NAMES[key]} on White days`}
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </form>
      )}
    </main>
  );
};

export default ClassSettings;
