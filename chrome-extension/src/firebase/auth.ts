import {
  createUserWithEmailAndPassword,
  initializeAuth,
  indexedDBLocalPersistence,
  sendPasswordResetEmail,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  browserLocalPersistence,
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
    // Keep one persistence policy across pages, with migration from older localStorage sessions.
    cachedAuth = initializeAuth(getFirebaseApp(), {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence]
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

// Read the current user after restoration every time; never cache a user or a timed-out null.
export async function waitForAuthReady(): Promise<User | null> {
  const auth = getAuthIfAvailable();
  if (!auth) return null;
  await auth.authStateReady();
  return auth.currentUser;
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(getOrInitAuth(), email.trim());
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



