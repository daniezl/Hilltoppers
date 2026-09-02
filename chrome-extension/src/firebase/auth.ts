import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  browserLocalPersistence,
  setPersistence,
  type ActionCodeSettings,
  type Auth,
  type Unsubscribe,
  type User,
  type UserCredential
} from 'firebase/auth';
import { getFirebaseApp } from './app';
import { isFirebaseConfigured } from './config';

let cachedAuth: Auth | null = null;

function getOrInitAuth(): Auth {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured.');
  }

  if (!cachedAuth) {
    cachedAuth = getAuth(getFirebaseApp());
    
    // Set persistence and configure for Chrome extension environment
    setPersistence(cachedAuth, browserLocalPersistence).catch((error) => {
      console.warn('[auth] Failed to set persistence', error);
    });
    
    if ('useDeviceLanguage' in cachedAuth && typeof cachedAuth.useDeviceLanguage === 'function') {
      cachedAuth.useDeviceLanguage();
    }
  }

  return cachedAuth;
}

function getAuthIfAvailable(): Auth | null {
  if (!isFirebaseConfigured()) {
    return null;
  }
  try {
    return getOrInitAuth();
  } catch (error) {
    console.warn('[auth] Failed to initialize Firebase Auth', error);
    return null;
  }
}

export type AuthUser = User;

export function getCurrentUser(): User | null {
  const auth = getAuthIfAvailable();
  return auth?.currentUser ?? null;
}

export function onAuthState(callback: (user: User | null) => void): Unsubscribe {
  const auth = getAuthIfAvailable();
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

let authReadyPromise: Promise<User | null> | null = null;

/**
 * Resolves after Firebase Auth has restored its persisted session (or confirmed
 * there is none). `getCurrentUser()` returns `null` until the first
 * `onAuthStateChanged` callback fires, so any code path that needs to decide
 * between remote (Firestore) and local (chrome.storage) data should await this
 * first to avoid a race on cold popup opens.
 *
 * Falls back to `null` after a short timeout so we never block UI indefinitely.
 */
export function waitForAuthReady(timeoutMs = 2500): Promise<User | null> {
  if (authReadyPromise) {
    return authReadyPromise;
  }
  const auth = getAuthIfAvailable();
  if (!auth) {
    authReadyPromise = Promise.resolve(null);
    return authReadyPromise;
  }
  if (auth.currentUser) {
    authReadyPromise = Promise.resolve(auth.currentUser);
    return authReadyPromise;
  }
  authReadyPromise = new Promise<User | null>((resolve) => {
    let settled = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe: Unsubscribe = () => {};

    const finish = (user: User | null) => {
      if (settled) return;
      settled = true;
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
      }
      try {
        unsubscribe();
      } catch {
        // ignore
      }
      resolve(user);
    };

    unsubscribe = onAuthStateChanged(
      auth,
      (user) => finish(user),
      () => finish(null)
    );
    timeoutHandle = setTimeout(() => {
      console.warn('[auth] waitForAuthReady timed out; falling back to current value');
      finish(auth.currentUser ?? null);
    }, timeoutMs);
  });
  return authReadyPromise;
}

export async function signInWithEmail(email: string, password: string): Promise<UserCredential> {
  const auth = getOrInitAuth();
  return signInWithEmailAndPassword(auth, email, password);
}

export async function registerWithEmail(
  email: string,
  password: string,
  displayName?: string
): Promise<UserCredential> {
  const auth = getOrInitAuth();
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName && credential.user) {
    try {
      await updateProfile(credential.user, { displayName });
    } catch (error) {
      console.warn('[auth] Failed to update display name after registration', error);
    }
  }
  return credential;
}

export async function signOut(): Promise<void> {
  const auth = getAuthIfAvailable();
  if (!auth) {
    return;
  }
  await firebaseSignOut(auth);
}

export async function sendVerificationEmail(
  user?: User | null,
  actionCodeSettings?: ActionCodeSettings
): Promise<void> {
  const target = user ?? getCurrentUser();
  if (!target) {
    throw new Error('No authenticated user available for verification email.');
  }
  if (target.emailVerified) {
    return;
  }
  await sendEmailVerification(target, actionCodeSettings);
}

export async function reloadCurrentUser(): Promise<User | null> {
  const auth = getAuthIfAvailable();
  if (!auth) {
    return null;
  }
  const user = auth.currentUser;
  if (!user) {
    return null;
  }
  await reload(user);
  try {
    await user.getIdToken(true);
  } catch (tokenError) {
    console.warn('[auth] Failed to refresh ID token after reload', tokenError);
  }
  return auth.currentUser;
}



