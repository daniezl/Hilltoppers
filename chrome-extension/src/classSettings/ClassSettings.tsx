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
import { logAnalyticsEvent } from '../firebase/analytics';

interface SaveState {
  status: 'idle' | 'saving' | 'success' | 'error';
  message: string;
}

const INITIAL_SAVE_STATE: SaveState = {
  status: 'idle',
  message: ''
};

const ClassSettings: React.FC = () => {
  const [preferences, setPreferences] = useState<SchedulePreferences>(DEFAULT_SCHEDULE_PREFERENCES);
  const [blockPrefs, setBlockPrefs] = useState<BlockPreferenceRecord>(createEmptyPreferences());
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>(INITIAL_SAVE_STATE);

  useEffect(() => {
    void logAnalyticsEvent('screen_view', { screen_name: 'class_settings' });

    (async () => {
      try {
        const [nextPrefs, nextBlocks] = await Promise.all([
          loadSchedulePreferences(),
          loadBlockPreferences()
        ]);
        setPreferences(nextPrefs);
        setBlockPrefs(nextBlocks);
      } catch (error) {
        console.error('[class-settings] Failed to load data', error);
        setSaveState({ status: 'error', message: 'Unable to load saved settings.' });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (saveState.status === 'success' || saveState.status === 'error') {
      const timeout = window.setTimeout(() => {
        setSaveState((prev) => (prev.status === 'saving' ? prev : INITIAL_SAVE_STATE));
      }, 4000);
      return () => window.clearTimeout(timeout);
    }
    return () => {};
  }, [saveState.status]);

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

  const handleReset = () => {
    setPreferences({ ...DEFAULT_SCHEDULE_PREFERENCES });
    setBlockPrefs(createEmptyPreferences());
    setSaveState({ status: 'idle', message: '' });
    void logAnalyticsEvent('class_settings_reset');
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaveState({ status: 'saving', message: 'Saving…' });

    try {
      await Promise.all([
        saveSchedulePreferences(preferences),
        saveBlockPreferences(blockPrefs)
      ]);
      if (typeof chrome !== 'undefined') {
        chrome.runtime?.sendMessage?.({ type: 'preferencesUpdated' });
      }
      setSaveState({ status: 'success', message: 'Saved successfully.' });
      void logAnalyticsEvent('preferences_saved', { source: 'class_settings' });
    } catch (error) {
      console.error('[class-settings] Failed to save settings', error);
      setSaveState({ status: 'error', message: 'Failed to save changes.' });
    }
  };

  const blockRows = useMemo(() => (Object.keys(DEFAULT_BLOCK_NAMES) as BlockKey[]), []);

  return (
    <main className="class-settings">
      <header className="class-settings__header">
        <div>
          <h1>Class Settings</h1>
          <p>Rename blocks and choose where they appear on Green or White days.</p>
        </div>
        <div className="class-settings__header-actions">
          <button type="button" className="secondary" onClick={handleReset} disabled={loading || saveState.status === 'saving'}>
            Reset to Defaults
          </button>
          <button
            type="submit"
            form="class-settings-form"
            className="primary"
            disabled={loading || saveState.status === 'saving'}
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
          <section className="class-settings__panel">
            <h2>Schedule Preferences</h2>
            <label className="class-settings__field">
              <span>Lunch period</span>
              <select value={preferences.lunchPeriod} onChange={handleLunchChange}>
                {[1, 2, 3, 4, 5].map((period) => (
                  <option key={period} value={period}>
                    {period}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="class-settings__panel">
            <h2>Class Blocks</h2>
            <div className="class-settings__table" role="table" aria-label="Class block preferences">
              <div className="class-settings__table-row class-settings__table-row--header" role="row">
                <div role="columnheader">Block</div>
                <div role="columnheader">Custom name</div>
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
                    <div role="cell">
                      <input
                        type="text"
                        value={pref.name}
                        placeholder={DEFAULT_BLOCK_NAMES[key]}
                        onChange={(event) => handleBlockNameChange(key, event.target.value)}
                        aria-label={`Custom name for ${DEFAULT_BLOCK_NAMES[key]}`}
                      />
                    </div>
                    <div role="cell" className="class-settings__table-toggle">
                      <label>
                        <input
                          type="checkbox"
                          checked={pref.showOnGreen}
                          onChange={() => handleBlockToggle(key, 'showOnGreen')}
                        />
                        <span>Show</span>
                      </label>
                    </div>
                    <div role="cell" className="class-settings__table-toggle">
                      <label>
                        <input
                          type="checkbox"
                          checked={pref.showOnWhite}
                          onChange={() => handleBlockToggle(key, 'showOnWhite')}
                        />
                        <span>Show</span>
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
