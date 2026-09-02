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
import { issuesUrl } from './ideas';
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

  // Deliberately the same request the board makes, not a cheaper stand-in for
  // it: a token can read /repos/{repo} and still be refused the issues under
  // it, and then this reports ok while every visitor sees a failure.
  let github = 'unknown';
  try {
    const response = await fetch(issuesUrl(env), {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Hilltoppers-Worker'
      }
    });
    if (response.ok) {
      const issues = (await response.json()) as unknown[];
      github = `ok (${Array.isArray(issues) ? issues.length : 0} issues)`;
    } else {
      github = `HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`;
    }
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
    jwks.ok && database === 'ok' && github.startsWith('ok') ? 200 : 503,
    request
  );
}
