import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getDb } from '../firebase/app';
import { getCurrentUser } from '../firebase/auth';
import { isFirebaseConfigured } from '../firebase/config';

export type BlockKey = 'A' | 'B' | 'C' | 'D' | 'E';

export interface BlockPreference {
  name: string;
  showOnGreen: boolean;
  showOnWhite: boolean;
}

export type BlockPreferenceRecord = Record<BlockKey, BlockPreference>;

const DEFAULT_PREFERENCE: BlockPreference = {
  name: '',
  showOnGreen: true,
  showOnWhite: true
};

export const DEFAULT_BLOCK_NAMES: Record<BlockKey, string> = {
  A: 'A Block',
  B: 'B Block',
  C: 'C Block',
  D: 'D Block',
  E: 'E Block'
};

const STORAGE_KEY = 'blockPreferences';
const USERS_COLLECTION = 'users';

function createDefaultPreferences(): BlockPreferenceRecord {
  return {
    A: { ...DEFAULT_PREFERENCE },
    B: { ...DEFAULT_PREFERENCE },
    C: { ...DEFAULT_PREFERENCE },
    D: { ...DEFAULT_PREFERENCE },
    E: { ...DEFAULT_PREFERENCE }
  };
}

export function createEmptyPreferences(): BlockPreferenceRecord {
  return createDefaultPreferences();
}

function mergeWithDefaults(
  stored: Partial<Record<BlockKey, Partial<BlockPreference>>> | undefined
): BlockPreferenceRecord {
  const defaults = createDefaultPreferences();
  const merged = { ...defaults };
  if (!stored) {
    return merged;
  }
  (Object.keys(defaults) as BlockKey[]).forEach((key) => {
    const pref = stored[key];
    if (pref) {
      merged[key] = {
        name: pref.name ?? '',
        showOnGreen: pref.showOnGreen ?? true,
        showOnWhite: pref.showOnWhite ?? true
      };
    }
  });
  return merged;
}

async function loadFromSyncStorage(): Promise<BlockPreferenceRecord> {
  if (typeof chrome === 'undefined' || !chrome.storage?.sync) {
    return createDefaultPreferences();
  }

  return new Promise((resolve) => {
    chrome.storage.sync.get([STORAGE_KEY], (result) => {
      const stored = result[STORAGE_KEY] as Partial<Record<BlockKey, Partial<BlockPreference>>> | undefined;
      resolve(mergeWithDefaults(stored));
    });
  });
}

async function saveToSyncStorage(preferences: BlockPreferenceRecord): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.sync) {
    return;
  }

  return new Promise((resolve, reject) => {
    chrome.storage.sync.set({ [STORAGE_KEY]: preferences }, () => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

async function loadFromRemote(userId: string): Promise<BlockPreferenceRecord | null> {
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
    const stored = data?.blockPreferences as Partial<Record<BlockKey, Partial<BlockPreference>>> | undefined;
    if (!stored) {
      return null;
    }
    return mergeWithDefaults(stored);
  } catch (error) {
    console.warn('[blockPreferences] Failed to load remote preferences', error);
    return null;
  }
}

async function saveToRemote(userId: string, preferences: BlockPreferenceRecord): Promise<void> {
  if (!isFirebaseConfigured()) {
    return;
  }
  const db = getDb();
  const ref = doc(db, USERS_COLLECTION, userId);
  await setDoc(
    ref,
    {
      blockPreferences: preferences,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

export async function loadBlockPreferences(): Promise<BlockPreferenceRecord> {
  const user = getCurrentUser();
  if (user) {
    const remote = await loadFromRemote(user.uid);
    if (remote) {
      try {
        await saveToSyncStorage(remote);
      } catch (error) {
        console.warn('[blockPreferences] Failed to cache remote preferences locally', error);
      }
      return remote;
    }
  }

  return loadFromSyncStorage();
}

export async function saveBlockPreferences(preferences: BlockPreferenceRecord): Promise<void> {
  await saveToSyncStorage(preferences);

  const user = getCurrentUser();
  if (user) {
    await saveToRemote(user.uid, preferences);
  }
}

export function getBlockKey(blockName: string): BlockKey | null {
  const normalized = blockName.trim().toLowerCase();
  const entries = Object.entries(DEFAULT_BLOCK_NAMES) as Array<[BlockKey, string]>;
  for (const [key, defaultName] of entries) {
    if (normalized === defaultName.toLowerCase()) {
      return key;
    }
  }
  const match = normalized.match(/^([a-e])\s*block/);
  if (match) {
    return match[1].toUpperCase() as BlockKey;
  }
  return null;
}

export function normalizeDayType(dayType: string | null | undefined): 'Green Day' | 'White Day' | null {
  if (!dayType) {
    return null;
  }
  const lower = dayType.toLowerCase();
  if (lower.includes('green day') && !lower.includes('white')) {
    return 'Green Day';
  }
  if (lower.includes('white day') && !lower.includes('green')) {
    return 'White Day';
  }
  return null;
}

export interface BlockDisplayInfo {
  label: string;
  originalName: string;
  isFree: boolean;
  emphasizeUnknown: boolean;
  useGrayText: boolean;
}

function hasOnlyOneDay(pref: BlockPreference): boolean {
  return pref.showOnGreen !== pref.showOnWhite;
}

export function resolveBlockDisplay(
  blockName: string,
  dayType: string | null,
  preferences: BlockPreferenceRecord
): BlockDisplayInfo {
  const key = getBlockKey(blockName);
  if (!key) {
    return {
      label: blockName,
      originalName: blockName,
      isFree: false,
      emphasizeUnknown: false,
      useGrayText: true
    };
  }
  const pref = preferences[key];
  const normalized = normalizeDayType(dayType);
  const onlyOneDay = hasOnlyOneDay(pref);

  if (!normalized) {
    if (onlyOneDay) {
      return {
        label: blockName,
        originalName: blockName,
        isFree: false,
        emphasizeUnknown: true,
        useGrayText: false
      };
    }
    const show = pref.showOnWhite;
    if (!show) {
      return {
        label: 'Free Block',
        originalName: blockName,
        isFree: true,
        emphasizeUnknown: false,
        useGrayText: true
      };
    }
    const custom = pref.name.trim();
    return {
      label: custom || blockName,
      originalName: blockName,
      isFree: false,
      emphasizeUnknown: false,
      useGrayText: false
    };
  }

  const isGreen = normalized === 'Green Day';
  const show = isGreen ? pref.showOnGreen : pref.showOnWhite;
  if (!show) {
    return {
      label: 'Free Block',
      originalName: blockName,
      isFree: true,
      emphasizeUnknown: false,
      useGrayText: true
    };
  }
  const custom = pref.name.trim();
  return {
    label: custom || blockName,
    originalName: blockName,
    isFree: false,
    emphasizeUnknown: false,
    useGrayText: false
  };
}
