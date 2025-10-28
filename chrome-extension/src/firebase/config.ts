type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
};

type AnalyticsConfig = {
  measurementId: string;
  apiSecret: string;
};

type FirebaseConfigRequiredKey =
  | 'apiKey'
  | 'authDomain'
  | 'projectId'
  | 'storageBucket'
  | 'messagingSenderId'
  | 'appId';

const REQUIRED_KEYS: FirebaseConfigRequiredKey[] = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId'
];

const env = import.meta.env ?? {};

const isPlaceholder = (value: string | undefined) => {
  if (!value) {
    return true;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 || trimmed.startsWith('REPLACE_ME');
};

const resolveRequired = (value: string | undefined, placeholder: string) =>
  !isPlaceholder(value) ? value!.trim() : placeholder;

const measurementId = (() => {
  const candidate = env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined;
  if (isPlaceholder(candidate)) {
    return undefined;
  }
  const trimmed = candidate?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
})();

const measurementSecret = (() => {
  const candidate = env.VITE_FIREBASE_MEASUREMENT_API_SECRET as string | undefined;
  if (isPlaceholder(candidate)) {
    return undefined;
  }
  const trimmed = candidate?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
})();

export const firebaseConfig: FirebaseConfig = {
  apiKey: resolveRequired(env.VITE_FIREBASE_API_KEY, 'REPLACE_ME'),
  authDomain: resolveRequired(env.VITE_FIREBASE_AUTH_DOMAIN, 'REPLACE_ME.firebaseapp.com'),
  projectId: resolveRequired(env.VITE_FIREBASE_PROJECT_ID, 'REPLACE_ME'),
  storageBucket: resolveRequired(env.VITE_FIREBASE_STORAGE_BUCKET, 'REPLACE_ME.appspot.com'),
  messagingSenderId: resolveRequired(env.VITE_FIREBASE_MESSAGING_SENDER_ID, 'REPLACE_ME'),
  appId: resolveRequired(env.VITE_FIREBASE_APP_ID, 'REPLACE_ME'),
  ...(measurementId ? { measurementId } : {})
};

export function isFirebaseConfigured(): boolean {
  return REQUIRED_KEYS.every((key) => {
    const value = firebaseConfig[key];
    return typeof value === 'string' && !isPlaceholder(value);
  });
}

export function isAnalyticsConfigured(): boolean {
  return typeof measurementId === 'string' && typeof measurementSecret === 'string';
}

export function getAnalyticsConfig(): AnalyticsConfig | null {
  if (!isAnalyticsConfigured()) {
    return null;
  }
  return {
    measurementId: measurementId!,
    apiSecret: measurementSecret!
  };
}
