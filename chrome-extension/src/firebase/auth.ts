import { FirebaseError } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  initializeAuth,
  indexedDBLocalPersistence,
  applyActionCode,
  confirmPasswordReset,
  linkWithCredential,
  onAuthStateChanged,
  reload,
  signInWithCredential,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  updateProfile,
  browserLocalPersistence,
  type Auth,
  type Unsubscribe,
  type User,
  type UserCredential
} from 'firebase/auth';
import { getFirebaseApp } from './app';
import { googleOAuthClientId, isFirebaseConfigured } from './config';

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

/**
 * The redirect URL Google sends the browser back to. It contains the extension
 * id, so the same value has to be registered on the OAuth client in Google
 * Cloud Console; it changes when the same code is loaded unpacked from a
 * different folder (the id is derived from the path) unless the manifest pins
 * the id with a `key`.
 */
export function googleRedirectUrl(): string {
  return chrome.identity.getRedirectURL();
}

/**
 * Read the `nonce` claim out of an ID token. The signature is checked by
 * Firebase, not here; this only confirms the token is the answer to the request
 * we just made.
 */
function idTokenNonce(idToken: string): string | null {
  try {
    const payload = idToken.split('.')[1] ?? '';
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/')
      .padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const claims = JSON.parse(atob(padded));
    return typeof claims.nonce === 'string' ? claims.nonce : null;
  } catch {
    return null;
  }
}

/** Ask Google for an ID token and access token in a Chrome auth window. */
async function requestGoogleTokens(): Promise<{ idToken: string; accessToken: string }> {
  if (!googleOAuthClientId) {
    throw new Error('Google sign-in is not set up yet. Ask the developer to add the OAuth client id.');
  }
  if (!chrome?.identity?.launchWebAuthFlow) {
    throw new Error('Google sign-in only works inside the Hilltoppers extension.');
  }

  const redirectUri = googleRedirectUrl();
  // launchWebAuthFlow returns whatever URL the auth window ends on, so a random
  // state is the only proof that the tokens belong to this sign-in attempt.
  // Google also rejects `response_type=id_token` without a nonce ("Nonce
  // required for response_type id_token"), so one is sent and then checked.
  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: googleOAuthClientId,
    response_type: 'id_token token',
    redirect_uri: redirectUri,
    scope: 'openid email profile',
    state,
    nonce,
    prompt: 'select_account'
  }).toString();

  const responseUrl = await new Promise<string | undefined>((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url: url.toString(), interactive: true }, (response) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(response);
    });
  });

  if (!responseUrl) {
    throw new Error('Sign-in was cancelled.');
  }

  const returned = new URL(responseUrl);
  const params = new URLSearchParams(returned.hash.replace(/^#/, ''));
  const denied = returned.searchParams.get('error') || params.get('error');
  if (denied) {
    throw new Error(params.get('error_description') || returned.searchParams.get('error_description') || 'Google could not sign you in.');
  }
  if (params.get('state') !== state) {
    throw new Error('Sign-in could not be completed. Please try again.');
  }

  const idToken = params.get('id_token');
  const accessToken = params.get('access_token');
  if (!idToken || !accessToken) {
    throw new Error('Google did not send a sign-in token. Please try again.');
  }
  if (idTokenNonce(idToken) !== nonce) {
    throw new Error('Sign-in could not be completed. Please try again.');
  }
  return { idToken, accessToken };
}

/**
 * `signInWithPopup` cannot run in a Manifest V3 extension page (it loads code
 * from apis.google.com, which the extension CSP blocks), so the OAuth window is
 * driven by chrome.identity and the tokens are handed to Firebase instead.
 */
export async function signInWithGoogle(): Promise<UserCredential> {
  const auth = getOrInitAuth();
  const { idToken, accessToken } = await requestGoogleTokens();
  return signInWithCredential(auth, GoogleAuthProvider.credential(idToken, accessToken));
}

/**
 * Attach a Google credential to the user who is already signed in, so the same
 * account (and its saved preferences) can be reached with Google from now on.
 * The uid does not change, so nothing stored under the account moves.
 */
export async function linkGoogleAccount(): Promise<User> {
  const auth = getOrInitAuth();
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Sign in first.');
  }
  const { idToken, accessToken } = await requestGoogleTokens();
  const linked = await linkWithCredential(user, GoogleAuthProvider.credential(idToken, accessToken));
  return linked.user;
}

export function googleEmail(user: User | null): string | null {
  return user?.providerData.find(provider => provider.providerId === 'google.com')?.email ?? null;
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
