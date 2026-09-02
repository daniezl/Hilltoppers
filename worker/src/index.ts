/**
 * Cloudflare Worker for the Hilltoppers ideas board.
 *
 * GitHub issues hold the ideas; this Worker holds the votes and verifies who is
 * voting. It is the only server-side code in the project. Schedule data does
 * not go through here — it is static JSON served from Cloudflare Pages, which
 * the iOS app and the extension read directly.
 */

import { handleCreateIdea, handleGetIdeas, handleVote } from './ideas';
import { handleHealth } from './health';
import { json, preflight } from './http';

const VOTE_PATH = /^\/api\/ideas\/\d+\/vote$/;
const HEALTH_PATH = '/api/ideas/health';

export interface Env {
  /** Caches the GitHub issue list and holds per-day submission counts. */
  SCHEDULE_KV: KVNamespace;
  /** One row per (issue, uid): the one-vote-per-account rule. */
  IDEAS_DB: D1Database;
  /** Fine-grained PAT with Issues read/write on GITHUB_REPO, nothing else. */
  GITHUB_TOKEN: string;
  GITHUB_REPO: string;
  /** Checked against the iss/aud claims of every Firebase ID token. */
  FIREBASE_PROJECT_ID: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;

    if (path !== '/api/ideas' && path !== HEALTH_PATH && !VOTE_PATH.test(path)) {
      return json({ error: 'Not found' }, 404, request);
    }

    if (request.method === 'OPTIONS') {
      return preflight(request);
    }

    if (path === HEALTH_PATH) {
      if (request.method === 'GET') {
        return handleHealth(request, env);
      }
    } else if (path === '/api/ideas') {
      if (request.method === 'GET') {
        return handleGetIdeas(request, env);
      }
      if (request.method === 'POST') {
        return handleCreateIdea(request, env);
      }
    } else {
      const issueNumber = Number(path.split('/')[3]);
      if (request.method === 'POST') {
        return handleVote(request, env, issueNumber, true);
      }
      if (request.method === 'DELETE') {
        return handleVote(request, env, issueNumber, false);
      }
    }

    return json({ error: 'Method not allowed' }, 405, request);
  }
};
