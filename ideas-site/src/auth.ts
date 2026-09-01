import { useEffect, useState } from 'react';
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut as firebaseSignOut,
  type Auth,
  type User
} from 'firebase/auth';
import { firebaseConfig, isFirebaseConfigured } from './config';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

function getAuthInstance(): Auth | null {
  if (!isFirebaseConfigured()) {
    return null;
  }
  if (!auth) {
    app = app ?? initializeApp(firebaseConfig);
    auth = getAuth(app);
    setPersistence(auth, browserLocalPersistence).catch((error) => {
      console.warn('[auth] Failed to set persistence', error);
    });
  }
  return auth;
}

export interface AuthState {
  user: User | null;
  ready: boolean;
}

export function useAuthUser(): AuthState {
  const [state, setState] = useState<AuthState>({ user: null, ready: false });

  useEffect(() => {
    const instance = getAuthInstance();
    if (!instance) {
      setState({ user: null, ready: true });
      return () => {};
    }
    return onAuthStateChanged(
      instance,
      (user) => setState({ user, ready: true }),
      () => setState({ user: null, ready: true })
    );
  }, []);

  return state;
}

export async function signIn(): Promise<void> {
  const instance = getAuthInstance();
  if (!instance) {
    throw new Error('Sign-in is not available right now.');
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(instance, provider);
}

export async function signOut(): Promise<void> {
  const instance = getAuthInstance();
  if (instance) {
    await firebaseSignOut(instance);
  }
}

export async function getIdToken(): Promise<string | null> {
  const instance = getAuthInstance();
  const user = instance?.currentUser;
  if (!user) {
    return null;
  }
  try {
    return await user.getIdToken();
  } catch (error) {
    console.warn('[auth] Failed to get ID token', error);
    return null;
  }
}
