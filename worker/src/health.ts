/**
 * Reports what the deployed Worker can actually reach.
 *
 * Exists because a broken dependency here is indistinguishable from an ordinary
 * signed-out request: an unreachable Firebase key set rejects every token and
 * surfaces as "Please sign in first", which sends you looking at the client.
 * One request against this answers whether the Worker is the problem, and which
 * build is live.
 *
 * Reports only whether secrets are present, never their values.
 */

import { probeJwks } from './firebaseAuth';
import { json } from './http';
import type { Env } from './index';

export async function handleHealth(request: Request, env: Env): Promise<Response> {
  const jwks = await probeJwks();

  let database = 'unknown';
  try {
    await env.IDEAS_DB.prepare('SELECT COUNT(*) AS n FROM votes').first<{ n: number }>();
    database = 'ok';
  } catch (error) {
    database = `failed: ${String(error)}`;
  }

  let github = 'unknown';
  try {
    const response = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}`, {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Hilltoppers-Worker'
      }
    });
    // 401 here means the token is missing or no longer valid, which is worth
    // separating from the repository being unreachable.
    github = response.ok ? 'ok' : `HTTP ${response.status}`;
  } catch (error) {
    github = `failed: ${String(error)}`;
  }

  return json(
    {
      firebaseKeys: jwks,
      firebaseProjectId: env.FIREBASE_PROJECT_ID,
      githubRepo: env.GITHUB_REPO,
      githubTokenSet: Boolean(env.GITHUB_TOKEN),
      github,
      database
    },
    jwks.ok && database === 'ok' && github === 'ok' ? 200 : 503,
    request
  );
}
