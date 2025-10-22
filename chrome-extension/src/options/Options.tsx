import React, { useEffect, useState } from 'react';

interface SchedulePreferences {
  lunchPeriod: number;
  hiddenBlocks: string[];
}

const DEFAULT_PREFERENCES: SchedulePreferences = {
  lunchPeriod: 1,
  hiddenBlocks: []
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
  const [hiddenBlocksInput, setHiddenBlocksInput] = useState<string>('');

  useEffect(() => {
    storageGet<SchedulePreferences>(PREF_KEY, DEFAULT_PREFERENCES)
      .then((prefs) => {
        const merged = { ...DEFAULT_PREFERENCES, ...prefs };
        setPreferences(merged);
        setHiddenBlocksInput(merged.hiddenBlocks.join(', '));
      })
      .catch((error) => {
        console.error('[options] Failed to load preferences', error);
        setStatus('Unable to load saved preferences.');
      });
  }, []);

  const handleLunchChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = Number(event.target.value);
    setPreferences((prev) => ({ ...prev, lunchPeriod: value }));
  };

  const handleHiddenChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const raw = event.target.value;
    const hidden = raw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    setHiddenBlocksInput(raw);
    setPreferences((prev) => ({ ...prev, hiddenBlocks: hidden }));
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus('Saving…');
    try {
      await storageSet(PREF_KEY, preferences);
      if (typeof chrome !== 'undefined') {
        chrome.runtime.sendMessage({ type: 'preferencesUpdated', payload: preferences });
      }
      setStatus('Preferences saved.');
    } catch (error) {
      console.error('[options] Failed to save preferences', error);
      setStatus('Failed to save.');
    }
  };

  return (
    <main className="options">
      <h1>Hilltoppers Preferences</h1>
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

        <label>
          Hidden blocks (comma separated names)
          <textarea
            rows={3}
            placeholder="Example: Advisory, Chapel"
            value={hiddenBlocksInput}
            onChange={handleHiddenChange}
          />
        </label>

        <button type="submit">Save Preferences</button>
      </form>
      {status && <p className="status">{status}</p>}
    </main>
  );
};

export default Options;
