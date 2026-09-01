/**
 * Carries a signed-in session from the extension to the ideas site.
 *
 * Firebase keeps its session per origin, so the popup (chrome-extension://…)
 * and the site (…pages.dev) never see each other's login, and a student who is
 * already signed in to the extension would otherwise be asked to sign in again
 * just to vote on the idea they clicked.
 *
 * The extension trades its ID token for a short single-use code, opens the site
 * with it, and the site trades the code back for the same token. The code, not
 * the token, is what travels in the URL: it dies on first use and within a
 * minute either way, so a copied link is worth nothing by the time it is
 * shared.
 */

import { verifyFirebaseToken } from './firebaseAuth';
import { json } from './http';
import type { Env } from './index';

// KV will not accept anything shorter.
const CODE_TTL_SECONDS = 60;
const KEY_PREFIX = 'ideas:handoff:';

function newCode(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function handleCreateHandoff(request: Request, env: Env): Promise<Response> {
  const header = request.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) {
    return json({ error: 'Sign in first.' }, 401, request);
  }

  const token = header.slice(7);
  // Verified rather than trusted: this mints a credential the site will accept,
  // so an unverifiable token must not get one.
  const user = await verifyFirebaseToken(request, env.FIREBASE_PROJECT_ID);
  if (!user) {
    return json({ error: 'Sign in first.' }, 401, request);
  }

  const code = newCode();
  await env.SCHEDULE_KV.put(`${KEY_PREFIX}${code}`, token, {
    expirationTtl: CODE_TTL_SECONDS
  });

  return json({ code, expiresIn: CODE_TTL_SECONDS }, 200, request);
}

export async function handleRedeemHandoff(request: Request, env: Env): Promise<Response> {
  let payload: { code?: unknown };
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Malformed request.' }, 400, request);
  }

  const code = typeof payload.code === 'string' ? payload.code : '';
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(code)) {
    return json({ error: 'Malformed request.' }, 400, request);
  }

  const key = `${KEY_PREFIX}${code}`;
  const token = await env.SCHEDULE_KV.get(key);
  if (!token) {
    return json({ error: 'That sign-in link has already been used.' }, 410, request);
  }

  // Single use: a link that reaches someone else is spent by the time it does.
  await env.SCHEDULE_KV.delete(key);

  return json({ token }, 200, request);
}
