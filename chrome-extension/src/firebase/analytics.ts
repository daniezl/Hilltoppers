// Utility to get (or create) a stable client_id per browser install.
async function getClientId(): Promise<string> {
  const key = 'ga_client_id';

  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  }

  return new Promise((resolve) => {
    chrome.storage.local.get([key], (data) => {
      const existing = data?.[key];
      if (existing) {
        resolve(existing);
        return;
      }

      const newId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;

      chrome.storage.local.set({ [key]: newId }, () => {
        resolve(newId);
      });
    });
  });
}

function getExtensionVersion(): string {
  if (typeof chrome === 'undefined' || !chrome.runtime?.getManifest) {
    return 'unknown';
  }
  try {
    const manifest = chrome.runtime.getManifest();
    return manifest?.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function getAnalyticsConfig(): { measurementId: string; apiSecret: string } | null {
  const measurementId = (import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined)?.trim();
  const apiSecret = (import.meta.env.VITE_FIREBASE_MEASUREMENT_API_SECRET as string | undefined)?.trim();

  if (!measurementId || !apiSecret) {
    return null;
  }

  return { measurementId, apiSecret };
}

// Core sender using GA4 Measurement Protocol
async function sendAnalyticsEvent(eventName: string, params: Record<string, unknown> = {}): Promise<void> {
  const config = getAnalyticsConfig();

  if (!config) {
    console.warn('[analytics] missing GA config');
    return;
  }

  if (typeof fetch === 'undefined') {
    console.warn('[analytics] fetch unavailable');
    return;
  }

  const extensionVersion = getExtensionVersion();
  const clientId = await getClientId();

  const body = {
    client_id: clientId,
    non_personalized_ads: true,
    events: [
      {
        name: eventName,
        params: {
          ...params,
          debug_mode: 1,
          extension_version: extensionVersion,
        },
      },
    ],
  };

  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(
    config.measurementId
  )}&api_secret=${encodeURIComponent(config.apiSecret)}`;

  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      credentials: 'omit',
      keepalive: true,
    });
  } catch (err) {
    console.warn('[analytics] failed to send', err);
  }
}

// Convenience wrappers for common events:

export async function logAppOpen(): Promise<void> {
  await sendAnalyticsEvent('app_open');
}

export async function logScreenView(screenName: string): Promise<void> {
  await sendAnalyticsEvent('screen_view', {
    screen_name: screenName,
  });
}

export async function logPreferenceSaved(prefKey: string): Promise<void> {
  await sendAnalyticsEvent('preferences_saved', {
    pref_key: prefKey,
  });
}

export async function logClassSettingsReset(): Promise<void> {
  await sendAnalyticsEvent('class_settings_reset');
}
