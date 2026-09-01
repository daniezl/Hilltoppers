/**
 * Picks up a session handed over by the extension.
 *
 * Firebase stores its session per origin, so being signed in to the popup does
 * nothing for this site. Rather than asking for a second sign-in, the popup
 * opens the site with a single-use code, which we trade back for the ID token
 * it was minted from.
 *
 * That token is not refreshable here — we hold the token, not the account — so
 * it lasts about an hour, after which the site falls back to ordinary sign-in.
 */

import { IDEAS_API_BASE } from './config';

const STORAGE_KEY = 'hilltoppers.handoff';
const HASH_PARAM = 'c';

export interface HandoffIdentity {
  uid: string;
  displayName: string | null;
  email: string | null;
  emailVerified: boolean;
  signInProvider: string | null;
  expiresAt: number;
}

interface StoredHandoff {
  token: string;
  identity: HandoffIdentity;
}

let cached: StoredHandoff | null | undefined;

function decodeSegment(segment: string): unknown {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

/**
 * Reads the claims for display only. The Worker verifies the signature on every
 * call, so nothing here is trusted for access decisions.
 */
function readIdentity(token: string): HandoffIdentity | null {
  try {
    const claims = decodeSegment(token.split('.')[1]) as Record<string, unknown>;
    const uid = typeof claims.sub === 'string' ? claims.sub : null;
    const exp = typeof claims.exp === 'number' ? claims.exp : null;
    if (!uid || !exp) {
      return null;
    }
    const firebase = claims.firebase as { sign_in_provider?: unknown } | undefined;
    return {
      uid,
      displayName: typeof claims.name === 'string' ? claims.name : null,
      email: typeof claims.email === 'string' ? claims.email : null,
      emailVerified: claims.email_verified === true,
      signInProvider:
        typeof firebase?.sign_in_provider === 'string' ? firebase.sign_in_provider : null,
      expiresAt: exp * 1000
    };
  } catch {
    return null;
  }
}

function read(): StoredHandoff | null {
  if (cached !== undefined) {
    return cached && cached.identity.expiresAt > Date.now() ? cached : null;
  }
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const token = raw;
      const identity = readIdentity(token);
      if (identity && identity.expiresAt > Date.now()) {
        cached = { token, identity };
        return cached;
      }
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Private browsing modes can refuse sessionStorage entirely.
  }
  cached = null;
  return null;
}

function store(token: string): boolean {
  const identity = readIdentity(token);
  if (!identity || identity.expiresAt <= Date.now()) {
    return false;
  }
  cached = { token, identity };
  try {
    sessionStorage.setItem(STORAGE_KEY, token);
  } catch {
    // Keeping it in memory is enough for this tab.
  }
  return true;
}

export function getHandoffToken(): string | null {
  return read()?.token ?? null;
}

export function getHandoffIdentity(): HandoffIdentity | null {
  return read()?.identity ?? null;
}

export function clearHandoff(): void {
  cached = null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clean up if storage was never available.
  }
}

/**
 * Trades the code in the URL for a token, and takes the code back out of the
 * address bar first so a copied link cannot carry it.
 */
export async function consumeHandoffCode(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.location.hash) {
    return false;
  }

  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const code = params.get(HASH_PARAM);
  if (!code) {
    return false;
  }

  params.delete(HASH_PARAM);
  const rest = params.toString();
  window.history.replaceState(
    null,
    '',
    window.location.pathname + window.location.search + (rest ? `#${rest}` : '')
  );

  try {
    const response = await fetch(`${IDEAS_API_BASE}/api/ideas/handoff/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    if (!response.ok) {
      return false;
    }
    const { token } = (await response.json()) as { token?: string };
    return typeof token === 'string' ? store(token) : false;
  } catch {
    return false;
  }
}
