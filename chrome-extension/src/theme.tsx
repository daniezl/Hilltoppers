import { useEffect, useState } from 'react';
import type { ThemeMode } from './storage/schedulePreferences';

export type DayTypeClass = 'green' | 'white' | 'no-school' | 'neutral';

export function getDayTypeClass(dayType: string | null | undefined): DayTypeClass {
  const lower = dayType?.toLowerCase() ?? '';
  if (lower.includes('green')) return 'green';
  if (lower.includes('white')) return 'white';
  if (lower.includes('no school')) return 'no-school';
  return 'neutral';
}

function prefersDark(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  return mode === 'dark' || (mode === 'system' && prefersDark()) ? 'dark' : 'light';
}

function loadStoredThemeMode(): Promise<ThemeMode | undefined> {
  if (typeof chrome === 'undefined' || !chrome.storage?.sync) {
    return Promise.resolve(undefined);
  }

  return new Promise((resolve) => {
    chrome.storage.sync.get(['schedulePreferences'], (result) => {
      const stored = result.schedulePreferences as { themeMode?: ThemeMode } | undefined;
      resolve(stored?.themeMode);
    });
  });
}

export function useExtensionTheme(
  requestedMode?: ThemeMode,
  dayType?: string | null
): 'light' | 'dark' {
  const mode = requestedMode ?? 'system';
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => resolveTheme(mode));

  useEffect(() => {
    let cancelled = false;
    if (requestedMode === undefined) {
      void loadStoredThemeMode().then((storedMode) => {
        if (!cancelled) setResolvedTheme(resolveTheme(storedMode ?? 'system'));
      });
    } else {
      setResolvedTheme(resolveTheme(mode));
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleMediaChange = () => {
      if (mode === 'system') setResolvedTheme(resolveTheme(mode));
    };
    media.addEventListener?.('change', handleMediaChange);

    return () => {
      cancelled = true;
      media.removeEventListener?.('change', handleMediaChange);
    };
  }, [mode, requestedMode]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    if (dayType !== undefined) {
      document.documentElement.dataset.dayType = getDayTypeClass(dayType);
    } else {
      delete document.documentElement.dataset.dayType;
    }
  }, [dayType, resolvedTheme]);

  return resolvedTheme;
}
