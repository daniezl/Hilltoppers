import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getDb } from '../firebase/app';
import { getCurrentUser } from '../firebase/auth';
import { isFirebaseConfigured } from '../firebase/config';

export type TimeFormat = '12h' | '24h';

export interface SchedulePreferences {
  lunchPeriod: number;
  timeFormat: TimeFormat;
  graduationYear?: number;
}

export const DEFAULT_SCHEDULE_PREFERENCES: SchedulePreferences = {
  lunchPeriod: 1,
  timeFormat: '12h'
};

const PREF_KEY = 'schedulePreferences';
const USERS_COLLECTION = 'users';

type StorageArea = typeof chrome.storage.sync;

function getStorage(): StorageArea | null {
  if (typeof chrome === 'undefined' || !chrome.storage?.sync) {
    return null;
  }
  return chrome.storage.sync;
}

async function loadFromSyncStorage(): Promise<SchedulePreferences> {
  const storage = getStorage();
  if (!storage) {
    return { ...DEFAULT_SCHEDULE_PREFERENCES };
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

async function saveToSyncStorage(preferences: SchedulePreferences): Promise<void> {
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

async function loadFromRemote(userId: string): Promise<SchedulePreferences | null> {
  if (!isFirebaseConfigured()) {
    return null;
  }
  try {
    const db = getDb();
    const ref = doc(db, USERS_COLLECTION, userId);
    const snapshot = await getDoc(ref);
    if (!snapshot.exists()) {
      return null;
    }
    const data = snapshot.data();
    const stored = data?.schedulePreferences as Partial<SchedulePreferences> | undefined;
    if (!stored) {
      return null;
    }
    return { ...DEFAULT_SCHEDULE_PREFERENCES, ...stored };
  } catch (error) {
    console.warn('[schedulePreferences] Failed to load remote preferences', error);
    return null;
  }
}

async function saveToRemote(userId: string, preferences: SchedulePreferences): Promise<void> {
  if (!isFirebaseConfigured()) {
    return;
  }
  const db = getDb();
  const ref = doc(db, USERS_COLLECTION, userId);
  await setDoc(
    ref,
    {
      schedulePreferences: preferences,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export async function loadSchedulePreferences(): Promise<SchedulePreferences> {
  const user = getCurrentUser();
  if (user) {
    const remote = await loadFromRemote(user.uid);
    if (remote) {
      try {
        await saveToSyncStorage(remote);
      } catch (error) {
        console.warn('[schedulePreferences] Failed to cache remote preferences locally', error);
      }
      return remote;
    }
  }

  return loadFromSyncStorage();
}

export async function saveSchedulePreferences(preferences: SchedulePreferences): Promise<void> {
  await saveToSyncStorage(preferences);

  const user = getCurrentUser();
  if (user) {
    await saveToRemote(user.uid, preferences);
  }
}
