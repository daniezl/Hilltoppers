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
import { onAuthState, reloadCurrentUser, signOut as signOutUser } from '../firebase/auth';
import type { AuthUser } from '../firebase/auth';
import { logClassSettingsReset, logPreferenceSaved, logScreenView } from '../firebase/analytics';
import { FirebaseError } from 'firebase/app';

interface SaveState {
  status: 'idle' | 'saving' | 'success' | 'error';
  message: string;
}

const INITIAL_SAVE_STATE: SaveState = {
  status: 'idle',
  message: ''
};

function resolveExtensionUrl(path: string): string {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(path);
  }
  return path;
}

function mapSaveError(error: unknown): string {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case 'permission-denied':
        return 'Unable to save because your account does not have permission. Please verify your email or sign in again.';
      case 'failed-precondition':
      case 'unavailable':
        return 'Saving failed because the connection to the server was interrupted. Please check your network and try again.';
      case 'unauthenticated':
        return 'Please sign in before saving your preferences.';
      default:
        return `Saving failed (${error.code}). Please try again or sign in again.`;
    }
  }
  if (error instanceof Error) {
    return `Saving failed: ${error.message}`;
  }
  return 'Saving failed due to an unexpected error. Please try again.';
}

function mapSignOutError(error: unknown): string {
  if (error instanceof FirebaseError) {
    return `Unable to sign out right now (${error.code}). Please try again.`;
  }
  if (error instanceof Error) {
    return `Unable to sign out: ${error.message}`;
  }
  return 'Unable to sign out right now. Please try again.';
}

const ClassSettings: React.FC = () => {
  const [blockPrefs, setBlockPrefs] = useState<BlockPreferenceRecord>(createEmptyPreferences());
  const [schedulePrefs, setSchedulePrefs] = useState<SchedulePreferences>(DEFAULT_SCHEDULE_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>(INITIAL_SAVE_STATE);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [signOutPending, setSignOutPending] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const loginUrl = useMemo(() => resolveExtensionUrl('login.html'), []);

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
          setSaveState({
            status: 'error',
            message: 'Unable to load saved settings. Check your connection and try again.'
          });
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
  }, [authInitialized, authUser?.uid, authUser?.emailVerified]);

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
            setFeedback({ type: 'success', message: 'Email verified! You can now sync preferences.' });
          }
        }
      } catch (error) {
        console.warn('[class-settings] Auto refresh verification failed', error);
      }
    };

    void refreshStatus();
    const handleFocus = () => {
      void refreshStatus();
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', handleFocus);
    };
  }, [needsEmailVerification]);

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
    setFeedback({ type: 'info', message: 'Preferences reset to defaults.' });
    void logClassSettingsReset();
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setFeedback(null);
    if (needsEmailVerification) {
      setSaveState({
        status: 'error',
        message: 'Email not verified. Please confirm your email before saving.'
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
      setSaveState({ status: 'success', message: 'All changes saved successfully.' });
      void logPreferenceSaved('class_settings');
    } catch (error) {
      console.error('[class-settings] Failed to save settings', error);
      setSaveState({
        status: 'error',
        message: mapSaveError(error)
      });
    }
  };

  const handleSignOut = async () => {
    setFeedback(null);
    setSignOutPending(true);
    try {
      await signOutUser();
      setFeedback({ type: 'info', message: 'Signed out. Changes will now stay on this device only.' });
    } catch (error) {
      console.error('[class-settings] Sign-out failed', error);
      setFeedback({ type: 'error', message: mapSignOutError(error) });
    } finally {
      setSignOutPending(false);
    }
  };

  const openLoginPage = () => {
    if (typeof window !== 'undefined') {
      window.location.href = loginUrl;
    }
  };

  return (
    <main className="class-settings">
      <header className="class-settings__topbar" aria-label="Account status">
        {!authInitialized ? (
          <span className="class-settings__topbar-text">Checking sign-in status…</span>
        ) : authUser ? (
          <div className="class-settings__topbar-user">
            <div className="class-settings__topbar-details">
              <span className="class-settings__topbar-label">Signed in as</span>
              <strong>{identityLabel}</strong>
              {needsEmailVerification ? (
                <span className="class-settings__badge">Email not verified</span>
              ) : null}
            </div>
            <button type="button" className="secondary" onClick={handleSignOut} disabled={signOutPending}>
              {signOutPending ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        ) : (
          <div className="class-settings__topbar-cta">
            <p>Sign in to sync your schedule and class preferences across devices.</p>
            <button type="button" className="primary" onClick={openLoginPage}>
              Go to Sign In
            </button>
          </div>
        )}
      </header>

      {feedback ? (
        <div className={`class-settings__notification class-settings__notification--${feedback.type}`} role="status" aria-live="polite">
          <p>{feedback.message}</p>
        </div>
      ) : null}

      {authUser && needsEmailVerification ? (
        <div className="class-settings__notification class-settings__notification--warning" role="status" aria-live="polite">
          <p>Your email is not verified. Open the sign-in page to resend the verification email or confirm the link in your inbox.</p>
          <button type="button" className="tertiary" onClick={openLoginPage}>
            Manage verification
          </button>
        </div>
      ) : null}

      {!authUser && authInitialized ? (
        <div className="class-settings__notification class-settings__notification--info" role="status" aria-live="polite">
          <p>Not signed in. Changes are saved to this browser only.</p>
        </div>
      ) : null}

      <header className="class-settings__header">
        <div>
          <h1>Class &amp; Schedule Settings</h1>
          <p>Rename blocks, choose your lunch period, and control how classes appear on Green and White days.</p>
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
            <p className="class-settings__hint">Signed-in users can sync these preferences across every device.</p>
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
