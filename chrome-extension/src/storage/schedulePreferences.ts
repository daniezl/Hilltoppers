export interface SchedulePreferences {
  lunchPeriod: number;
}

export const DEFAULT_SCHEDULE_PREFERENCES: SchedulePreferences = {
  lunchPeriod: 1
};

const PREF_KEY = 'schedulePreferences';

type StorageArea = typeof chrome.storage.sync;

function getStorage(): StorageArea | null {
  if (typeof chrome === 'undefined' || !chrome.storage?.sync) {
    return null;
  }
  return chrome.storage.sync;
}

export async function loadSchedulePreferences(): Promise<SchedulePreferences> {
  const storage = getStorage();
  if (!storage) {
    return DEFAULT_SCHEDULE_PREFERENCES;
  }

  return new Promise((resolve, reject) => {
    storage.get([PREF_KEY], (result) => {
      const err = chrome.runtime?.lastError;
      if (err) {
        reject(err);
        return;
      }
      const stored = result[PREF_KEY] as Partial<SchedulePreferences> | undefined;
      resolve({ ...DEFAULT_SCHEDULE_PREFERENCES, ...stored });
    });
  });
}

export async function saveSchedulePreferences(preferences: SchedulePreferences): Promise<void> {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  return new Promise((resolve, reject) => {
    storage.set({ [PREF_KEY]: preferences }, () => {
      const err = chrome.runtime?.lastError;
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}
