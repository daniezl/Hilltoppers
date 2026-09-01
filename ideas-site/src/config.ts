const env = import.meta.env;

export const IDEAS_API_BASE =
  (env.VITE_IDEAS_API_URL as string | undefined) ||
  'https://schedule-admin-api.danielzhang089.workers.dev';

export const GITHUB_REPO_URL =
  (env.VITE_GITHUB_REPO_URL as string | undefined) || 'https://github.com/daniezl/Hilltoppers';

export const firebaseConfig = {
  apiKey: (env.VITE_FIREBASE_API_KEY as string) ?? '',
  authDomain: (env.VITE_FIREBASE_AUTH_DOMAIN as string) ?? '',
  projectId: (env.VITE_FIREBASE_PROJECT_ID as string) ?? '',
  storageBucket: (env.VITE_FIREBASE_STORAGE_BUCKET as string) ?? '',
  messagingSenderId: (env.VITE_FIREBASE_MESSAGING_SENDER_ID as string) ?? '',
  appId: (env.VITE_FIREBASE_APP_ID as string) ?? ''
};

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
}
