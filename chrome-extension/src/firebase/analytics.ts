import { getAnalyticsConfig, isAnalyticsConfigured } from './config';

const ANALYTICS_ENDPOINT = 'https://www.google-analytics.com/mp/collect';
const CLIENT_STORAGE_KEY = 'analyticsClientId';
const EVENT_NAME_PATTERN = /^[a-zA-Z0-9_]{1,40}$/;

let clientIdPromise: Promise<string | null> | null = null;

function sanitizeEventName(name: string): string {
  if (EVENT_NAME_PATTERN.test(name)) {
    return name;
  }
  const normalized = name
    .trim()
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return normalized.length > 0 ? normalized : 'custom_event';
}

function sanitizeParamKey(key: string): string | null {
  if (!key) {
    return null;
  }
  const normalized = key
    .trim()
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  if (!normalized) {
    return null;
  }
  if (/^ga_/.test(normalized.toLowerCase())) {
    return null;
  }
  return normalized;
}

type AllowedParamValue = string | number | boolean;

function normalizeParams(params?: Record<string, unknown>): Record<string, AllowedParamValue> | undefined {
  if (!params) {
    return undefined;
  }
  const entries: [string, AllowedParamValue][] = [];
  for (const [rawKey, rawValue] of Object.entries(params)) {
    const key = sanitizeParamKey(rawKey);
    if (!key) {
      continue;
    }
    if (rawValue == null) {
      continue;
    }
    let value: AllowedParamValue | null = null;
    const type = typeof rawValue;
    if (type === 'string') {
      value = rawValue.length > 100 ? rawValue.slice(0, 100) : rawValue;
    } else if (type === 'number') {
      if (Number.isFinite(rawValue)) {
        value = rawValue;
      }
    } else if (type === 'boolean') {
      value = rawValue;
    } else if (rawValue instanceof Date) {
      value = rawValue.toISOString();
    } else {
      try {
        const asString = String(rawValue);
        value = asString.length > 100 ? asString.slice(0, 100) : asString;
      } catch {
        continue;
      }
    }

    if (value !== null) {
      entries.push([key, value]);
    }

    if (entries.length >= 25) {
      break;
    }
  }

  if (!entries.length) {
    return undefined;
  }

  return Object.fromEntries(entries);
}

function getFromChromeStorage(key: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      resolve(undefined);
      return;
    }
    try {
      chrome.storage.local.get([key], (items) => {
        if (chrome.runtime?.lastError) {
          resolve(undefined);
          return;
        }
        const value = items?.[key];
        resolve(typeof value === 'string' && value ? value : undefined);
      });
    } catch {
      resolve(undefined);
    }
  });
}

function setInChromeStorage(key: string, value: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      resolve();
      return;
    }
    try {
      chrome.storage.local.set({ [key]: value }, () => {
        resolve();
      });
    } catch {
      resolve();
    }
  });
}

async function loadClientId(): Promise<string | undefined> {
  const fromChrome = await getFromChromeStorage(CLIENT_STORAGE_KEY);
  if (fromChrome) {
    return fromChrome;
  }
  try {
    const value = typeof localStorage !== 'undefined' ? localStorage.getItem(CLIENT_STORAGE_KEY) : null;
    if (typeof value === 'string' && value) {
      return value;
    }
  } catch {
    // ignore storage failures
  }
  return undefined;
}

async function persistClientId(clientId: string): Promise<void> {
  await Promise.allSettled([
    setInChromeStorage(CLIENT_STORAGE_KEY, clientId),
    (async () => {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(CLIENT_STORAGE_KEY, clientId);
        }
      } catch {
        // ignore storage failures
      }
    })()
  ]);
}

async function ensureClientId(): Promise<string | null> {
  if (clientIdPromise) {
    return clientIdPromise;
  }
  clientIdPromise = (async () => {
    const existing = await loadClientId();
    if (existing) {
      return existing;
    }
    let generated: string;
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      generated = crypto.randomUUID();
    } else {
      generated = `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    }
    await persistClientId(generated);
    return generated;
  })();
  return clientIdPromise;
}

async function sendMeasurementEvent(
  eventName: string,
  params?: Record<string, unknown>
): Promise<void> {
  const analyticsConfig = getAnalyticsConfig();
  if (!analyticsConfig || typeof fetch === 'undefined') {
    return;
  }

  const clientId = await ensureClientId();
  if (!clientId) {
    return;
  }

  const safeName = sanitizeEventName(eventName);
  const safeParams = normalizeParams(params);
  const eventParams = safeParams ? { ...safeParams } : {};
  eventParams.debug_mode = true;

  const payload: Record<string, unknown> = {
    client_id: clientId,
    non_personalized_ads: true,
    events: [
      {
        name: safeName,
        params: eventParams
      }
    ]
  };

  const url = `${ANALYTICS_ENDPOINT}?measurement_id=${encodeURIComponent(
    analyticsConfig.measurementId
  )}&api_secret=${encodeURIComponent(analyticsConfig.apiSecret)}`;

  const requestInit: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    mode: 'cors',
    keepalive: true,
  };

  try {
    const response = await fetch(url, requestInit);

    if (!response.ok) {
      console.debug(
        `[analytics] Measurement Protocol request failed for ${safeName}`,
        response.status,
        await response.text()
      );
    }

    return;
  } catch (error) {
    console.debug(`[analytics] fetch failed for ${safeName}, falling back`, error);
  }

  const beaconPayload = JSON.stringify(payload);
  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const sent = navigator.sendBeacon(url, beaconPayload);
    if (!sent) {
      console.debug(`[analytics] sendBeacon rejected for ${safeName}`);
    }
    return;
  }

  try {
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      body: beaconPayload,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    });
  } catch (finalError) {
    console.debug(`[analytics] Unable to log event ${safeName}`, finalError);
  }
}

export async function logAnalyticsEvent(
  eventName: string,
  params?: Record<string, unknown>
): Promise<void> {
  if (!isAnalyticsConfigured()) {
    return;
  }
  await sendMeasurementEvent(eventName, params);
}

export async function logAppOpen(): Promise<void> {
  await logAnalyticsEvent('app_open');
}
