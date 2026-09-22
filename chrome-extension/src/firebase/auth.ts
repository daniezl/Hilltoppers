import { FirebaseError } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  initializeAuth,
  indexedDBLocalPersistence,
  applyActionCode,
  confirmPasswordReset,
  onAuthStateChanged,
  reload,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  browserLocalPersistence,
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

const EMAIL_API = 'https://hilltoppers-account-email.danielzhang089.workers.dev/api/account-email';
async function emailRequest(path: string, body: object, user?: User | null) {
  const response = await fetch(EMAIL_API + path, {
    method: 'POST', headers: {'Content-Type':'application/json', ...(user ? {Authorization:'Bearer '+await user.getIdToken()} : {})},
    body: JSON.stringify(body), signal: AbortSignal.timeout(30000)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not complete this request.');
  return data;
}
export async function resetPassword(email: string): Promise<string> {
  return (await emailRequest('/send', {purpose:'reset', email:email.trim()})).challengeId;
}
export async function redeemEmailCode(challengeId: string, code: string, user?: User | null): Promise<string> {
  return (await emailRequest('/redeem', {challengeId, code}, user)).actionCode;
}
export async function completeEmailVerification(actionCode: string): Promise<void> {
  await applyActionCode(getOrInitAuth(), actionCode);
  await reloadCurrentUser();
}
export async function completePasswordReset(actionCode: string, password: string): Promise<void> {
  await confirmPasswordReset(getOrInitAuth(), actionCode, password);
}

export async function signInWithEmail(email: string, password: string): Promise<UserCredential> {
  const auth = getOrInitAuth();
  try { return await signInWithEmailAndPassword(auth, email, password); }
  catch (error) {
    if (error instanceof FirebaseError && ['auth/invalid-credential','auth/wrong-password','auth/user-not-found'].includes(error.code)) {
      let exists: boolean | undefined;
      try { exists = (await emailRequest('/check', {email})).exists; }
      catch { /* Preserve the original login error when lookup is unavailable. */ }
      if (exists === false) throw new Error('No account found with this email.');
    }
    throw error;
  }
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

export async function sendVerificationEmail(user?: User | null): Promise<string> {
  const target = user ?? getCurrentUser();
  if (!target) throw new Error('Sign in to verify your email.');
  return (await emailRequest('/send', {purpose:'verify'}, target)).challengeId;
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




export function isSchoolEmail(email: string | null | undefined): boolean {
  return /^[^\s@]+@(student\.stjacademy\.org|stjacademy\.org)$/.test((email || '').toLowerCase());
}
export async function getSchoolEmail(user: User): Promise<{email:string|null;verified:boolean}> {
  return emailRequest('/school', {}, user);
}
export async function requestSchoolEmailCode(user: User, email: string): Promise<string> {
  return (await emailRequest('/school/send', {email}, user)).challengeId;
}
export async function linkSchoolEmail(user: User, challengeId: string, code: string): Promise<{email:string;verified:boolean}> {
  return emailRequest('/school/redeem', {challengeId,code}, user);
}

export async function unlinkSchoolEmail(user: User): Promise<void> {
  await emailRequest('/school/unlink', {}, user);
}
