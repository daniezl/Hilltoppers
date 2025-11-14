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
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

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
      }, 3000);
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

  // Auto-save effect with debounce
  useEffect(() => {
    if (loading || !authInitialized) {
      return undefined;
    }

    if (!hasUnsavedChanges) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        if (needsEmailVerification) {
          setSaveState({
            status: 'error',
            message: 'Email not verified. Please confirm your email before saving.'
          });
          setHasUnsavedChanges(false);
          return;
        }

        setSaveState({ status: 'saving', message: 'Auto-saving…' });

        try {
          await Promise.all([
            saveBlockPreferences(blockPrefs),
            saveSchedulePreferences(schedulePrefs)
          ]);
          if (typeof chrome !== 'undefined') {
            chrome.runtime?.sendMessage?.({ type: 'preferencesUpdated' });
          }
          setSaveState({ status: 'success', message: 'Changes saved automatically.' });
          setHasUnsavedChanges(false);
          void logPreferenceSaved('class_settings_auto');
        } catch (error) {
          console.error('[class-settings] Auto-save failed', error);
          setSaveState({
            status: 'error',
            message: mapSaveError(error)
          });
          setHasUnsavedChanges(false);
        }
      })();
    }, 1000); // 1 second debounce

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [blockPrefs, schedulePrefs, hasUnsavedChanges, loading, authInitialized, needsEmailVerification]);

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
    setHasUnsavedChanges(true);
  };

  const handleBlockNameChangeAlternating = (key: BlockKey, day: 'green' | 'white', value: string) => {
    setBlockPrefs((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [day === 'green' ? 'nameGreen' : 'nameWhite']: value
      }
    }));
    setHasUnsavedChanges(true);
  };

  const handleAlternatingToggle = (key: BlockKey) => {
    setBlockPrefs((prev) => {
      const current = prev[key];
      const newAlternating = !(current.alternating ?? false);
      const currentName = current.name.trim();
      const isFree = current.free ?? false;
      
      return {
        ...prev,
        [key]: {
          ...current,
          alternating: newAlternating,
          // When enabling alternating, copy current name to both fields if they're empty
          nameGreen: newAlternating 
            ? (current.nameGreen && current.nameGreen.trim() ? current.nameGreen : (isFree ? '' : currentName))
            : current.nameGreen,
          nameWhite: newAlternating 
            ? (current.nameWhite && current.nameWhite.trim() ? current.nameWhite : (isFree ? '' : currentName))
            : current.nameWhite,
          // If current is free, set both days as free when enabling alternating
          freeGreen: newAlternating 
            ? (current.freeGreen ?? (isFree ? true : false))
            : current.freeGreen,
          freeWhite: newAlternating 
            ? (current.freeWhite ?? (isFree ? true : false))
            : current.freeWhite
        }
      };
    });
    setHasUnsavedChanges(true);
  };

  const handleFreeToggle = (key: BlockKey) => {
    setBlockPrefs((prev) => {
      const current = prev[key];
      const isFree = !(current.free ?? false);
      
      if (isFree) {
        // Marking as free: save current name to backup and set display to "Free Block"
        const currentName = current.name.trim();
        return {
          ...prev,
          [key]: {
            ...current,
            free: true,
            nameBackup: currentName && currentName !== 'Free Block' ? currentName : (current.nameBackup ?? ''),
            name: 'Free Block'
          }
        };
      } else {
        // Unmarking free: restore name from backup
        return {
          ...prev,
          [key]: {
            ...current,
            free: false,
            name: current.nameBackup && current.nameBackup.trim() ? current.nameBackup : ''
          }
        };
      }
    });
    setHasUnsavedChanges(true);
  };

  const handleFreeToggleAlternating = (key: BlockKey, day: 'green' | 'white') => {
    setBlockPrefs((prev) => {
      const current = prev[key];
      const isFree = !(current[day === 'green' ? 'freeGreen' : 'freeWhite'] ?? false);
      
      if (isFree) {
        // Marking as free: save current name to backup and set display to "Free Block"
        if (day === 'green') {
          const currentName = current.nameGreen ?? '';
          const trimmedName = currentName.trim();
          return {
            ...prev,
            [key]: {
              ...current,
              freeGreen: true,
              nameGreenBackup: trimmedName && trimmedName !== 'Free Block' ? trimmedName : (current.nameGreenBackup ?? ''),
              nameGreen: 'Free Block'
            }
          };
        } else {
          const currentName = current.nameWhite ?? '';
          const trimmedName = currentName.trim();
          return {
            ...prev,
            [key]: {
              ...current,
              freeWhite: true,
              nameWhiteBackup: trimmedName && trimmedName !== 'Free Block' ? trimmedName : (current.nameWhiteBackup ?? ''),
              nameWhite: 'Free Block'
            }
          };
        }
      } else {
        // Unmarking free: restore name from backup
        if (day === 'green') {
          const backupName = current.nameGreenBackup ?? '';
          return {
            ...prev,
            [key]: {
              ...current,
              freeGreen: false,
              nameGreen: backupName.trim() ? backupName : ''
            }
          };
        } else {
          const backupName = current.nameWhiteBackup ?? '';
          return {
            ...prev,
            [key]: {
              ...current,
              freeWhite: false,
              nameWhite: backupName.trim() ? backupName : ''
            }
          };
        }
      }
    });
    setHasUnsavedChanges(true);
  };

  const handleTimeFormatChange = (format: '12h' | '24h') => {
    setSchedulePrefs((prev) => ({
      ...prev,
      timeFormat: format
    }));
    setHasUnsavedChanges(true);
  };


  const handleReset = () => {
    const confirmed = window.confirm(
      'Are you sure you want to reset all settings to defaults? This will erase all your custom block names and preferences.'
    );
    
    if (!confirmed) {
      return;
    }

    setBlockPrefs(createEmptyPreferences());
    setSchedulePrefs(DEFAULT_SCHEDULE_PREFERENCES);
    setSaveState({ status: 'idle', message: '' });
    setFeedback({ type: 'info', message: 'Preferences reset to defaults.' });
    setHasUnsavedChanges(true);
    void logClassSettingsReset();
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
          <p>Rename blocks and control how classes appear on Green and White days. Changes save automatically.</p>
        </div>
        <div className="class-settings__header-actions">
          {saveState.status === 'saving' && (
            <span className="class-settings__autosave-indicator">
              <span className="class-settings__autosave-spinner"></span>
              Auto-saving…
            </span>
          )}
          {saveState.status === 'success' && (
            <span className="class-settings__autosave-indicator class-settings__autosave-indicator--success">
              ✓ Saved
            </span>
          )}
          <button type="button" className="secondary" onClick={handleReset} disabled={loading || saveState.status === 'saving'}>
            Reset to Defaults
          </button>
        </div>
      </header>

      {saveState.status === 'error' && saveState.message ? (
        <div className={`class-settings__status class-settings__status--error`}>
          {saveState.message}
        </div>
      ) : null}

      {loading ? (
        <div className="class-settings__loading">Loading…</div>
      ) : (
        <div className="class-settings__form">
          <section className="class-settings__panel">
            <h2>Display Settings</h2>
            <div className="class-settings__field">
              <label htmlFor="time-format">Time format</label>
              <select
                id="time-format"
                value={schedulePrefs.timeFormat}
                onChange={(e) => handleTimeFormatChange(e.target.value as '12h' | '24h')}
              >
                <option value="12h">12-hour</option>
                <option value="24h">24-hour</option>
              </select>
            </div>
          </section>

          <section className="class-settings__panel">
            <h2>Class Blocks</h2>
            <div className="class-settings__table" role="table" aria-label="Class block preferences">
              <div className="class-settings__table-row class-settings__table-row--header" role="row">
                <div role="columnheader">Block</div>
                <div role="columnheader">Course name</div>
                <div role="columnheader">Alternating</div>
              </div>
              {blockRows.map((key) => {
                const pref = blockPrefs[key];
                const isAlternating = pref.alternating ?? false;
                return (
                  <div key={key} className="class-settings__table-row" role="row">
                    <div role="cell" className="class-settings__table-label">
                      <strong>{DEFAULT_BLOCK_NAMES[key]}</strong>
                    </div>
                    <div role="cell" className="class-settings__table-input-group">
                      {!isAlternating ? (
                        <div className="class-settings__input-with-free">
                          <input
                            type="text"
                            value={pref.name}
                            placeholder={DEFAULT_BLOCK_NAMES[key]}
                            onChange={(event) => handleBlockNameChange(key, event.target.value)}
                            aria-label={`Course name for ${DEFAULT_BLOCK_NAMES[key]}`}
                            disabled={pref.free ?? false}
                          />
                          <label className="class-settings__free-checkbox">
                            <input
                              type="checkbox"
                              checked={pref.free ?? false}
                              onChange={() => handleFreeToggle(key)}
                              aria-label={`Free block for ${DEFAULT_BLOCK_NAMES[key]}`}
                            />
                            <span>Free</span>
                          </label>
                        </div>
                      ) : (
                        <div className="class-settings__alternating-inputs">
                          <div className="class-settings__input-with-free">
                            <span className="class-settings__day-label">💚 Green</span>
                            <input
                              type="text"
                              value={pref.nameGreen ?? ''}
                              placeholder={`${DEFAULT_BLOCK_NAMES[key]} (Green day)`}
                              onChange={(event) => handleBlockNameChangeAlternating(key, 'green', event.target.value)}
                              aria-label={`Course name for ${DEFAULT_BLOCK_NAMES[key]} on Green days`}
                              disabled={pref.freeGreen ?? false}
                            />
                            <label className="class-settings__free-checkbox">
                              <input
                                type="checkbox"
                                checked={pref.freeGreen ?? false}
                                onChange={() => handleFreeToggleAlternating(key, 'green')}
                                aria-label={`Free block for ${DEFAULT_BLOCK_NAMES[key]} on Green days`}
                              />
                              <span>Free</span>
                            </label>
                          </div>
                          <div className="class-settings__input-with-free">
                            <span className="class-settings__day-label">🤍 White</span>
                            <input
                              type="text"
                              value={pref.nameWhite ?? ''}
                              placeholder={`${DEFAULT_BLOCK_NAMES[key]} (White day)`}
                              onChange={(event) => handleBlockNameChangeAlternating(key, 'white', event.target.value)}
                              aria-label={`Course name for ${DEFAULT_BLOCK_NAMES[key]} on White days`}
                              disabled={pref.freeWhite ?? false}
                            />
                            <label className="class-settings__free-checkbox">
                              <input
                                type="checkbox"
                                checked={pref.freeWhite ?? false}
                                onChange={() => handleFreeToggleAlternating(key, 'white')}
                                aria-label={`Free block for ${DEFAULT_BLOCK_NAMES[key]} on White days`}
                              />
                              <span>Free</span>
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                    <div role="cell" className="class-settings__table-toggle">
                      <label>
                        <input
                          type="checkbox"
                          checked={isAlternating}
                          onChange={() => handleAlternatingToggle(key)}
                          aria-label={`Alternating classes for ${DEFAULT_BLOCK_NAMES[key]}`}
                        />
                        <span>Alternating</span>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </main>
  );
};

export default ClassSettings;
