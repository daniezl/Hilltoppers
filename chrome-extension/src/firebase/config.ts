type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

const env = import.meta.env ?? {};

const fallback = (value: string | undefined, placeholder: string) =>
  value && value.trim().length > 0 ? value : placeholder;

export const firebaseConfig: FirebaseConfig = {
  apiKey: fallback(env.VITE_FIREBASE_API_KEY, 'REPLACE_ME'),
  authDomain: fallback(env.VITE_FIREBASE_AUTH_DOMAIN, 'REPLACE_ME.firebaseapp.com'),
  projectId: fallback(env.VITE_FIREBASE_PROJECT_ID, 'REPLACE_ME'),
  storageBucket: fallback(env.VITE_FIREBASE_STORAGE_BUCKET, 'REPLACE_ME.appspot.com'),
  messagingSenderId: fallback(env.VITE_FIREBASE_MESSAGING_SENDER_ID, 'REPLACE_ME'),
  appId: fallback(env.VITE_FIREBASE_APP_ID, 'REPLACE_ME')
};
