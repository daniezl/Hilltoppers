import React, { useEffect, useState } from 'react';
import {
  DEFAULT_BLOCK_NAMES,
  BlockPreferenceRecord,
  BlockKey,
  createEmptyPreferences,
  loadBlockPreferences,
  saveBlockPreferences
} from '../storage/blockPreferences';
import { logAnalyticsEvent } from '../firebase/analytics';

interface SchedulePreferences {
  lunchPeriod: number;
}

const DEFAULT_PREFERENCES: SchedulePreferences = {
  lunchPeriod: 1
};

function storageGet<T>(key: string, fallback: T): Promise<T> {
  return new Promise((resolve, reject) => {
    if (typeof chrome === 'undefined' || !chrome.storage?.sync) {
      resolve(fallback);
      return;
    }

    chrome.storage.sync.get([key], (result) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(err);
        return;
      }
      if (result[key]) {
        resolve(result[key] as T);
      } else {
        resolve(fallback);
      }
    });
  });
}

function storageSet<T>(key: string, value: T): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof chrome === 'undefined' || !chrome.storage?.sync) {
      resolve();
      return;
    }

    chrome.storage.sync.set({ [key]: value }, () => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

const PREF_KEY = 'schedulePreferences';

const Options: React.FC = () => {
  const [preferences, setPreferences] = useState<SchedulePreferences>(DEFAULT_PREFERENCES);
  const [status, setStatus] = useState<string>('');
  const [blockPrefs, setBlockPrefs] = useState<BlockPreferenceRecord>(createEmptyPreferences());
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    void logAnalyticsEvent('screen_view', { screen_name: 'options' });

    (async () => {
      try {
        const prefs = await storageGet<SchedulePreferences>(PREF_KEY, DEFAULT_PREFERENCES);
        setPreferences({ ...DEFAULT_PREFERENCES, ...prefs });
        const blocks = await loadBlockPreferences();
        setBlockPrefs(blocks);
      } catch (error) {
        console.error('[options] Failed to load preferences', error);
        setStatus('Unable to load saved preferences.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleLunchChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = Number(event.target.value);
    setPreferences((prev) => ({ ...prev, lunchPeriod: value }));
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

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus('Saving…');
    try {
      await storageSet(PREF_KEY, preferences);
      await saveBlockPreferences(blockPrefs);
      if (typeof chrome !== 'undefined') {
        chrome.runtime.sendMessage({ type: 'preferencesUpdated' });
      }
      void logAnalyticsEvent('preferences_saved', { source: 'options' });
      setStatus('Preferences saved.');
    } catch (error) {
      console.error('[options] Failed to save preferences', error);
      setStatus('Failed to save.');
    }
  };

  return (
    <main className="options">
      <h1>Hilltoppers Preferences</h1>
      {loading ? (
        <p className="status">Loading…</p>
      ) : (
      <form onSubmit={handleSave}>
        <label>
          Lunch period
          <select value={preferences.lunchPeriod} onChange={handleLunchChange}>
            {[1, 2, 3, 4, 5].map((period) => (
              <option key={period} value={period}>
                {period}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="block-settings">
          <legend>Block settings</legend>
          <div className="block-settings-grid">
            {(Object.keys(DEFAULT_BLOCK_NAMES) as BlockKey[]).map((key) => {
              const pref = blockPrefs[key];
              return (
                <div key={key} className="block-settings-row">
                  <div className="block-settings-name">
                    <label htmlFor={`block-name-${key}`}>{DEFAULT_BLOCK_NAMES[key]}</label>
                    <input
                      id={`block-name-${key}`}
                      type="text"
                      value={pref.name}
                      placeholder={DEFAULT_BLOCK_NAMES[key]}
                      onChange={(event) => handleBlockNameChange(key, event.target.value)}
                    />
                  </div>
                  <div className="block-settings-toggles">
                    <label>
                      <input
                        type="checkbox"
                        checked={pref.showOnGreen}
                        onChange={() => handleBlockToggle(key, 'showOnGreen')}
                      />
                      Green
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={pref.showOnWhite}
                        onChange={() => handleBlockToggle(key, 'showOnWhite')}
                      />
                      White
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </fieldset>

        <button type="submit">Save Preferences</button>
      </form>
      )}
      {status && <p className="status">{status}</p>}
    </main>
  );
};

export default Options;
