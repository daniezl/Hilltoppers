import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getDb } from '../firebase/app';
import { getCurrentUser } from '../firebase/auth';
import { isFirebaseConfigured } from '../firebase/config';

export type BlockKey = 'A' | 'B' | 'C' | 'D' | 'E';

export interface BlockPreference {
  name: string;
  // Legacy fields - only used for migration, will be removed after migration
  showOnGreen?: boolean;
  showOnWhite?: boolean;
  // New fields for alternating mode
  alternating?: boolean;
  nameGreen?: string;
  nameWhite?: string;
  freeGreen?: boolean;
  freeWhite?: boolean;
  // Free block option for non-alternating mode
  free?: boolean;
  // Backup fields to store original names when marked as free
  nameBackup?: string;
  nameGreenBackup?: string;
  nameWhiteBackup?: string;
  // Migration flag - indicates if migration from old format has been completed
  migrated?: boolean;
}

export type BlockPreferenceRecord = Record<BlockKey, BlockPreference>;

const DEFAULT_PREFERENCE: BlockPreference = {
  name: '',
  alternating: false,
  nameGreen: '',
  nameWhite: '',
  freeGreen: false,
  freeWhite: false,
  free: false,
  nameBackup: '',
  nameGreenBackup: '',
  nameWhiteBackup: '',
  migrated: true
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
      const name = pref.name ?? '';
      const isMigrated = pref.migrated ?? false;
      
      // Only perform migration if not already migrated
      if (!isMigrated && (pref.showOnGreen !== undefined || pref.showOnWhite !== undefined)) {
        const showOnGreen = pref.showOnGreen ?? true;
        const showOnWhite = pref.showOnWhite ?? true;
        
        let isAlternating = pref.alternating ?? false;
        let nameGreen = pref.nameGreen ?? '';
        let nameWhite = pref.nameWhite ?? '';
        let freeGreen = pref.freeGreen ?? false;
        let freeWhite = pref.freeWhite ?? false;
        let isFree = pref.free ?? false;
        
        // Migration logic based on old showOnGreen/showOnWhite values
        if (!showOnGreen && !showOnWhite) {
          // Both unchecked -> mark as free block, not alternating
          isFree = true;
          isAlternating = false;
          nameGreen = '';
          nameWhite = '';
          freeGreen = false;
          freeWhite = false;
        } else if (showOnGreen && !showOnWhite) {
          // Only green day checked -> convert to alternating mode
          isAlternating = true;
          nameGreen = name;
          nameWhite = '';
          freeGreen = false;
          freeWhite = true;
          isFree = false;
        } else if (!showOnGreen && showOnWhite) {
          // Only white day checked -> convert to alternating mode
          isAlternating = true;
          nameGreen = '';
          nameWhite = name;
          freeGreen = true;
          freeWhite = false;
          isFree = false;
        } else {
          // Both checked -> normal mode, not alternating, not free
          isAlternating = false;
          isFree = false;
          nameGreen = '';
          nameWhite = '';
          freeGreen = false;
          freeWhite = false;
        }
        
        // After migration, mark as migrated and don't include old fields
        merged[key] = {
          name: isFree ? 'Free Block' : name,
          alternating: isAlternating,
          nameGreen,
          nameWhite,
          freeGreen,
          freeWhite,
          free: isFree,
          nameBackup: isFree && name.trim() && name !== 'Free Block' ? name : (pref.nameBackup ?? ''),
          nameGreenBackup: pref.nameGreenBackup ?? '',
          nameWhiteBackup: pref.nameWhiteBackup ?? '',
          migrated: true
        };
      } else {
        // Already migrated or no old fields - use new format directly
        merged[key] = {
          name,
          alternating: pref.alternating ?? false,
          nameGreen: pref.nameGreen ?? '',
          nameWhite: pref.nameWhite ?? '',
          freeGreen: pref.freeGreen ?? false,
          freeWhite: pref.freeWhite ?? false,
          free: pref.free ?? false,
          nameBackup: pref.nameBackup ?? '',
          nameGreenBackup: pref.nameGreenBackup ?? '',
          nameWhiteBackup: pref.nameWhiteBackup ?? '',
          migrated: true
        };
      }
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

// Clean old fields from preferences before saving
function cleanPreferences(preferences: BlockPreferenceRecord): BlockPreferenceRecord {
  const cleaned: BlockPreferenceRecord = {} as BlockPreferenceRecord;
  (Object.keys(preferences) as BlockKey[]).forEach((key) => {
    const pref = preferences[key];
    cleaned[key] = {
      name: pref.name,
      alternating: pref.alternating ?? false,
      nameGreen: pref.nameGreen ?? '',
      nameWhite: pref.nameWhite ?? '',
      freeGreen: pref.freeGreen ?? false,
      freeWhite: pref.freeWhite ?? false,
      free: pref.free ?? false,
      nameBackup: pref.nameBackup ?? '',
      nameGreenBackup: pref.nameGreenBackup ?? '',
      nameWhiteBackup: pref.nameWhiteBackup ?? '',
      migrated: true
    };
  });
  return cleaned;
}

async function saveToSyncStorage(preferences: BlockPreferenceRecord): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.sync) {
    return;
  }

  // Clean old fields before saving
  const cleaned = cleanPreferences(preferences);

  return new Promise((resolve, reject) => {
    chrome.storage.sync.set({ [STORAGE_KEY]: cleaned }, () => {
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
  
  // Clean old fields before saving
  const cleaned = cleanPreferences(preferences);
  
  await setDoc(
    ref,
    {
      blockPreferences: cleaned,
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
  // This function is only used for legacy mode, which should not happen after migration
  // But we keep it for backward compatibility during migration
  if (pref.showOnGreen !== undefined && pref.showOnWhite !== undefined) {
    return pref.showOnGreen !== pref.showOnWhite;
  }
  // After migration, this should not be used, but return false as default
  return false;
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
  const isAlternating = pref.alternating ?? false;

  // Handle alternating mode
  if (isAlternating) {
    if (!normalized) {
      // Unknown day type - show both or emphasize
      return {
        label: blockName,
        originalName: blockName,
        isFree: false,
        emphasizeUnknown: true,
        useGrayText: false
      };
    }

    const isGreen = normalized === 'Green Day';
    const isFree = isGreen ? (pref.freeGreen ?? false) : (pref.freeWhite ?? false);
    const customName = isGreen ? (pref.nameGreen ?? '').trim() : (pref.nameWhite ?? '').trim();

    if (isFree) {
      return {
        label: 'Free Block',
        originalName: blockName,
        isFree: true,
        emphasizeUnknown: false,
        useGrayText: true
      };
    }

    return {
      label: customName || blockName,
      originalName: blockName,
      isFree: false,
      emphasizeUnknown: false,
      useGrayText: false
    };
  }

  // Non-alternating mode
  const isFree = pref.free ?? false;
  
  if (isFree) {
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
