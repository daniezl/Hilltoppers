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

export async function loadBlockPreferences(): Promise<BlockPreferenceRecord> {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage?.sync) {
      resolve(createDefaultPreferences());
      return;
    }

    chrome.storage.sync.get([STORAGE_KEY], (result) => {
      const stored = result[STORAGE_KEY] as BlockPreferenceRecord | undefined;
      if (!stored) {
        resolve(createDefaultPreferences());
        return;
      }
      const defaults = createDefaultPreferences();
      const merged = { ...defaults };
      (Object.keys(defaults) as BlockKey[]).forEach((key) => {
        if (stored[key]) {
          merged[key] = {
            name: stored[key].name ?? '',
            showOnGreen: stored[key].showOnGreen ?? true,
            showOnWhite: stored[key].showOnWhite ?? true
          };
        }
      });
      resolve(merged);
    });
  });
}

export async function saveBlockPreferences(preferences: BlockPreferenceRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof chrome === 'undefined' || !chrome.storage?.sync) {
      resolve();
      return;
    }

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
      emphasizeUnknown: false
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
        emphasizeUnknown: true
      };
    }
    const show = pref.showOnWhite;
    if (!show) {
      return {
        label: 'Free Block',
        originalName: blockName,
        isFree: true,
        emphasizeUnknown: false
      };
    }
    const custom = pref.name.trim();
    return {
      label: custom || blockName,
      originalName: blockName,
      isFree: false,
      emphasizeUnknown: false
    };
  }

  const isGreen = normalized === 'Green Day';
  const show = isGreen ? pref.showOnGreen : pref.showOnWhite;
  if (!show) {
    return {
      label: 'Free Block',
      originalName: blockName,
      isFree: true,
      emphasizeUnknown: false
    };
  }
  const custom = pref.name.trim();
  return {
    label: custom || blockName,
    originalName: blockName,
    isFree: false,
    emphasizeUnknown: false
  };
}
