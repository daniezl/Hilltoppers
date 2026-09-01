import { useEffect, useState } from 'react';
import { FirebaseError, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  OAuthProvider,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendEmailVerification,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  type Auth,
  type User
} from 'firebase/auth';
import { firebaseConfig, isFirebaseConfigured } from './config';
import {
  clearHandoff,
  consumeHandoffCode,
  getHandoffIdentity,
  getHandoffToken,
  type HandoffIdentity
} from './handoff';

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

/**
 * Every entry point goes through here, so a build that shipped without the
 * Firebase variables says so instead of failing as "sign-in is unavailable",
 * which reads like an outage and sends you looking in the wrong place.
 */
function requireAuth(): Auth {
  const instance = getAuthInstance();
  if (!instance) {
    throw new Error(
      'This site was built without its Firebase settings, so sign-in cannot start. ' +
        'The VITE_FIREBASE_* build variables need to be set, and the site rebuilt.'
    );
  }
  return instance;
}

export function authAvailable(): boolean {
  return isFirebaseConfigured();
}

/**
 * One shape for both ways of being signed in: an account signed in on this
 * site, or a session handed over by the extension.
 */
export interface BoardUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  emailVerified: boolean;
  /** Email/password accounts are the only ones that can be unverified. */
  passwordAccount: boolean;
  /** False when the session came from the extension, which limits what we can do with it. */
  local: boolean;
}

export interface AuthState {
  user: BoardUser | null;
  ready: boolean;
}

function toBoardUser(user: User): BoardUser {
  return {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    emailVerified: user.emailVerified,
    passwordAccount: user.providerData.some((entry) => entry?.providerId === 'password'),
    local: true
  };
}

export function useAuthUser(): AuthState {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [firebaseReady, setFirebaseReady] = useState(false);
  const [handoff, setHandoff] = useState<HandoffIdentity | null>(getHandoffIdentity());
  const [handoffReady, setHandoffReady] = useState(false);

  useEffect(() => {
    const instance = getAuthInstance();
    if (!instance) {
      setFirebaseReady(true);
      return () => {};
    }
    return onAuthStateChanged(
      instance,
      (user) => {
        setFirebaseUser(user);
        setFirebaseReady(true);
      },
      () => {
        setFirebaseUser(null);
        setFirebaseReady(true);
      }
    );
  }, []);

  useEffect(() => {
    let active = true;
    consumeHandoffCode()
      .then(() => {
        if (active) {
          setHandoff(getHandoffIdentity());
        }
      })
      .finally(() => {
        if (active) {
          setHandoffReady(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  // A real sign-in on this site outranks a carried-over one: it can refresh
  // itself, and it is what the person most recently chose.
  const user = firebaseUser
    ? toBoardUser(firebaseUser)
    : handoff
      ? {
          uid: handoff.uid,
          displayName: handoff.displayName,
          email: handoff.email,
          emailVerified: handoff.emailVerified,
          passwordAccount: handoff.signInProvider === 'password',
          local: false
        }
      : null;

  return { user, ready: firebaseReady && handoffReady };
}

export async function signInWithGoogle(): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(requireAuth(), provider);
}

export async function signInWithApple(): Promise<void> {
  const provider = new OAuthProvider('apple.com');
  provider.addScope('email');
  provider.addScope('name');
  await signInWithPopup(requireAuth(), provider);
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(requireAuth(), email, password);
}

export async function registerWithEmail(
  email: string,
  password: string,
  displayName: string
): Promise<void> {
  const credential = await createUserWithEmailAndPassword(requireAuth(), email, password);

  if (displayName && credential.user) {
    try {
      await updateProfile(credential.user, { displayName });
    } catch (error) {
      console.warn('[auth] Failed to set display name', error);
    }
  }

  // Posting an idea requires a verified address, so send the email as part of
  // registering rather than leaving people to discover the block later.
  try {
    await sendEmailVerification(credential.user);
  } catch (error) {
    console.warn('[auth] Failed to send verification email', error);
  }
}

export async function resendVerificationEmail(): Promise<void> {
  const user = getAuthInstance()?.currentUser;
  if (!user) {
    // A handed-over session is a token, not an account, so Firebase has nothing
    // here to send a fresh email to.
    throw new Error('Sign in on this page first, then we can send it again.');
  }
  await sendEmailVerification(user);
}

/** True only for password accounts still awaiting verification. */
export function needsEmailVerification(user: BoardUser | null): boolean {
  return Boolean(user && user.passwordAccount && !user.emailVerified);
}

export async function signOut(): Promise<void> {
  clearHandoff();
  const instance = getAuthInstance();
  if (instance) {
    await firebaseSignOut(instance);
  }
}

export async function getIdToken(): Promise<string | null> {
  const user = getAuthInstance()?.currentUser;
  if (user) {
    try {
      return await user.getIdToken();
    } catch (error) {
      console.warn('[auth] Failed to get ID token', error);
    }
  }
  return getHandoffToken();
}

export function mapAuthError(error: unknown): string {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case 'auth/invalid-email':
        return 'That email address does not look right.';
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Wrong email or password.';
      case 'auth/user-not-found':
        return 'No account with that email yet. Create one instead.';
      case 'auth/email-already-in-use':
        return 'There is already an account with that email. Try signing in.';
      case 'auth/weak-password':
        return 'Passwords need to be at least 6 characters.';
      case 'auth/user-disabled':
        return 'This account has been disabled.';
      case 'auth/network-request-failed':
        return 'Network problem. Check your connection and try again.';
      case 'auth/too-many-requests':
        return 'Too many tries. Wait a moment and try again.';
      case 'auth/popup-closed-by-user':
        return 'The sign-in window closed before it finished.';
      case 'auth/cancelled-popup-request':
        return 'Another sign-in is already open.';
      case 'auth/popup-blocked':
        return 'Your browser blocked the sign-in window. Allow pop-ups and try again.';
      case 'auth/operation-not-allowed':
        return 'That sign-in method is turned off for this project.';
      case 'auth/unauthorized-domain':
        return 'This site is not on the Firebase authorised domains list yet.';
      default:
        return `Could not sign in (${error.code}).`;
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Could not sign in. Try again in a moment.';
}
