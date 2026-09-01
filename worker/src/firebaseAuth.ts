/**
 * Firebase ID token verification for the ideas board.
 *
 * The extension and the ideas website both sign in against the same Firebase
 * project, so a given student resolves to the same `uid` on either surface and
 * their votes de-duplicate automatically.
 */

import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwks/securetoken@system.gserviceaccount.com')
);

export interface AppUser {
  uid: string;
  emailVerified: boolean;
  displayName: string;
}

/**
 * Shortens a full name so only a first name and last initial ever reach the
 * public repository. Issue bodies are permanent and indexed by search engines.
 */
function shortenName(full: string): string {
  // The name ends up inside an HTML comment in the issue body, so anything that
  // could terminate the comment or inject markup has to go first.
  const safe = full.replace(/[^\p{L}\p{N} '-]/gu, '').trim().slice(0, 40);
  const parts = safe.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return 'Anonymous';
  }
  if (parts.length === 1) {
    return parts[0];
  }
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

/**
 * Returns the authenticated user, or null when the request carries no token or
 * a token that fails verification. Callers decide whether that is fatal:
 * listing ideas works anonymously, voting and submitting do not.
 */
export async function verifyFirebaseToken(
  request: Request,
  projectId: string
): Promise<AppUser | null> {
  const header = request.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(header.slice(7), JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId
    });

    const uid = typeof payload.sub === 'string' ? payload.sub : null;
    if (!uid) {
      return null;
    }

    return {
      uid,
      emailVerified: payload.email_verified === true,
      displayName: shortenName(typeof payload.name === 'string' ? payload.name : '')
    };
  } catch {
    // Bad signature, expired, or wrong project. All are just "not signed in".
    return null;
  }
}
