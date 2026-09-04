/**
 * Firebase client configuration for the extension.
 *
 * These values are committed on purpose, the same way
 * `ios/SJA_re/GoogleService-Info.plist` is. They identify the Firebase project;
 * they are not credentials. Google publishes web config in page source, and
 * every build of this extension has shipped them in its bundle. What actually
 * protects the data is Firestore Security Rules.
 *
 * Committing them means `npm ci && npm run build` produces a working extension
 * with no setup step. It used to require a gitignored `.env.local`, and a build
 * made without it was silently broken: sign-in and preference sync did nothing,
 * and — until the check was removed — the day colour silently stopped being
 * predicted forward, so the extension showed yesterday's colour. That is how
 * the Green/White bug of 4 September 2026 happened.
 *
 * The one value NOT here is VITE_FIREBASE_MEASUREMENT_API_SECRET, which is a
 * real secret: it lets anyone holding it write events into our GA4 property.
 * It stays in `.env.local`, and analytics simply stays off without it
 * (see analytics.ts). Everything else works.
 *
 * Every value can still be overridden by the matching VITE_* variable, which is
 * how you would point a build at a different Firebase project.
 */

type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
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

/**
 * The web app in the `schedule-59d28` project. Note `appId` ends in `:web:` —
 * the iOS plist holds a different key and a `:ios:` appId, and using those here
 * fails sign-in.
 */
const DEFAULTS: Required<Pick<FirebaseConfig, FirebaseConfigRequiredKey>> & { measurementId: string } = {
  apiKey: 'AIzaSyCPDKZHahJOA2WIJaOaYDYDcxFNAW2oUK0',
  authDomain: 'schedule-59d28.firebaseapp.com',
  projectId: 'schedule-59d28',
  storageBucket: 'schedule-59d28.firebasestorage.app',
  messagingSenderId: '11216800424',
  appId: '1:11216800424:web:6b56559c636eb27432509d',
  measurementId: 'G-7YGM7HVLF6'
};

const env = import.meta.env ?? {};

const isBlank = (value: string | undefined) => !value || value.trim().length === 0;

/** The env var when it is set to something, otherwise the committed default. */
const resolve = (value: string | undefined, fallback: string) =>
  isBlank(value) ? fallback : value!.trim();

export const firebaseConfig: FirebaseConfig = {
  apiKey: resolve(env.VITE_FIREBASE_API_KEY, DEFAULTS.apiKey),
  authDomain: resolve(env.VITE_FIREBASE_AUTH_DOMAIN, DEFAULTS.authDomain),
  projectId: resolve(env.VITE_FIREBASE_PROJECT_ID, DEFAULTS.projectId),
  storageBucket: resolve(env.VITE_FIREBASE_STORAGE_BUCKET, DEFAULTS.storageBucket),
  messagingSenderId: resolve(env.VITE_FIREBASE_MESSAGING_SENDER_ID, DEFAULTS.messagingSenderId),
  appId: resolve(env.VITE_FIREBASE_APP_ID, DEFAULTS.appId),
  measurementId: resolve(env.VITE_FIREBASE_MEASUREMENT_ID, DEFAULTS.measurementId)
};

/**
 * True in every normal build, since the values above are committed. It still
 * exists so that blanking a default here fails closed rather than initialising
 * Firebase with an empty project id, and so the callers that genuinely need
 * Firebase keep saying so at the point they need it.
 */
export function isFirebaseConfigured(): boolean {
  return REQUIRED_KEYS.every((key) => !isBlank(firebaseConfig[key]));
}
