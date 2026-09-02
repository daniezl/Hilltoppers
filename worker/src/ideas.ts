/**
 * Ideas board API.
 *
 * GitHub issues hold the content and the status; this Worker holds the votes.
 * A vote cannot be a GitHub reaction because every API call made with the bot
 * token is attributed to that one account, so the whole school would only ever
 * add up to a single 👍.
 *
 * Moderation rides on the `enhancement` label: submissions are created with no
 * labels at all, so they stay off the board until a maintainer adds it in the
 * GitHub UI. There is no separate review queue and no admin screen.
 */

import { verifyFirebaseToken, type AppUser } from './firebaseAuth';
import { json } from './http';
import type { Env } from './index';

const BOARD_LABEL = 'enhancement';
const CACHE_KEY = 'ideas:list';
const CACHE_TTL_SECONDS = 60;
const DAILY_SUBMISSION_LIMIT = 3;

const TITLE_MIN = 5;
const TITLE_MAX = 80;
const BODY_MIN = 10;
const BODY_MAX = 1000;

export type IdeaStatus = 'open' | 'in-progress' | 'shipped' | 'declined';

interface CachedIdea {
  number: number;
  title: string;
  body: string;
  author: string | null;
  status: IdeaStatus;
  /** 👍 reactions left on GitHub itself, used as a starting count. */
  seedVotes: number;
  url: string;
  createdAt: string;
}

export interface Idea extends CachedIdea {
  votes: number;
  hasVoted: boolean;
}

function githubHeaders(env: Env): Record<string, string> {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    // GitHub rejects API requests without a User-Agent outright.
    'User-Agent': 'Hilltoppers-Worker'
  };
}

function toStatus(issue: any): IdeaStatus {
  const labels: string[] = (issue.labels ?? []).map((l: any) => (typeof l === 'string' ? l : l.name));
  // Declined issues are usually closed too, so this has to win over `closed`.
  if (labels.includes('wontfix')) {
    return 'declined';
  }
  if (issue.state === 'closed') {
    return 'shipped';
  }
  if ((issue.assignees ?? []).length > 0) {
    return 'in-progress';
  }
  return 'open';
}

function extractAuthor(body: string): string | null {
  const match = body.match(/<!--\s*hilltoppers:author=(.*?)\s*-->/);
  return match ? match[1] : null;
}

function stripMetadata(body: string): string {
  return body
    .replace(/<!--\s*hilltoppers:[\s\S]*?-->/g, '')
    .replace(/\n*_Submitted from the Hilltoppers extension[^\n]*_\n*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function issuesUrl(env: Env): string {
  return (
    `https://api.github.com/repos/${env.GITHUB_REPO}/issues` +
    `?labels=${encodeURIComponent(BOARD_LABEL)}&state=all&per_page=100&sort=created&direction=desc`
  );
}

async function fetchIssuesFromGitHub(env: Env): Promise<CachedIdea[]> {
  const res = await fetch(issuesUrl(env), { headers: githubHeaders(env) });
  if (!res.ok) {
    // The status alone does not say whether the token lacks Issues access, has
    // expired, or hit a limit, and this is the only place that ever sees the
    // explanation.
    throw new Error(`GitHub API returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  const raw = (await res.json()) as any[];
  return raw
    // The issues endpoint also returns pull requests.
    .filter((issue) => !issue.pull_request)
    .map((issue) => {
      const body: string = issue.body ?? '';
      return {
        number: issue.number,
        title: issue.title,
        body: stripMetadata(body),
        author: extractAuthor(body),
        status: toStatus(issue),
        seedVotes: issue.reactions?.['+1'] ?? 0,
        url: issue.html_url,
        createdAt: issue.created_at
      };
    });
}

async function getCachedIssues(env: Env): Promise<CachedIdea[]> {
  const cached = await env.SCHEDULE_KV.get(CACHE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached) as CachedIdea[];
    } catch (error) {
      // A cache entry that will not parse used to throw from here and be
      // reported as GitHub being unreachable, which is the wrong place to look.
      console.warn('[ideas] Discarding unparseable cache entry', error);
    }
  }
  const issues = await fetchIssuesFromGitHub(env);
  await env.SCHEDULE_KV.put(CACHE_KEY, JSON.stringify(issues), {
    expirationTtl: CACHE_TTL_SECONDS
  });
  return issues;
}

/**
 * Vote counts are read straight from D1 on every request rather than cached
 * alongside the issues, so a vote is reflected immediately instead of up to a
 * cache period later.
 */
async function loadVoteCounts(env: Env): Promise<Map<number, number>> {
  const { results } = await env.IDEAS_DB.prepare(
    'SELECT issue_number, COUNT(*) AS n FROM votes GROUP BY issue_number'
  ).all<{ issue_number: number; n: number }>();
  return new Map(results.map((row) => [row.issue_number, row.n]));
}

async function loadUserVotes(env: Env, uid: string): Promise<Set<number>> {
  const { results } = await env.IDEAS_DB.prepare(
    'SELECT issue_number FROM votes WHERE uid = ?'
  )
    .bind(uid)
    .all<{ issue_number: number }>();
  return new Set(results.map((row) => row.issue_number));
}

export async function handleGetIdeas(request: Request, env: Env): Promise<Response> {
  let issues: CachedIdea[];
  try {
    issues = await getCachedIssues(env);
  } catch (error) {
    console.error('[ideas] Failed to load issues', error);
    return json({ error: 'Could not reach GitHub right now.' }, 502, request);
  }

  // Listing works signed out; the token only decides whether we can say which
  // ideas the caller has already voted for.
  const user = await verifyFirebaseToken(request, env.FIREBASE_PROJECT_ID);

  let voteCounts: Map<number, number>;
  let myVotes: Set<number>;
  try {
    voteCounts = await loadVoteCounts(env);
    myVotes = user ? await loadUserVotes(env, user.uid) : new Set<number>();
  } catch (error) {
    // Unguarded, a D1 hiccup threw out of the handler as a bare 500, which the
    // site showed as the same "could not load" as an unreachable GitHub.
    console.error('[ideas] Failed to read votes', error);
    return json({ error: 'Could not read the votes right now.' }, 502, request);
  }

  const ideas: Idea[] = issues.map((issue) => ({
    ...issue,
    votes: (voteCounts.get(issue.number) ?? 0) + issue.seedVotes,
    hasVoted: myVotes.has(issue.number)
  }));

  return json({ ideas, signedIn: Boolean(user) }, 200, request);
}

async function requireUser(
  request: Request,
  env: Env
): Promise<{ user: AppUser } | { response: Response }> {
  const user = await verifyFirebaseToken(request, env.FIREBASE_PROJECT_ID);
  if (!user) {
    return { response: json({ error: 'Please sign in first.' }, 401, request) };
  }
  return { user };
}

/**
 * Per-account daily cap, kept in KV so it needs no schema. Without it a script
 * could bury the repository in issues, and GitHub has no bulk delete.
 */
async function checkAndCountSubmission(env: Env, uid: string): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10);
  const key = `ideas:sub:${uid}:${day}`;
  const used = Number((await env.SCHEDULE_KV.get(key)) ?? '0');
  if (used >= DAILY_SUBMISSION_LIMIT) {
    return false;
  }
  await env.SCHEDULE_KV.put(key, String(used + 1), { expirationTtl: 60 * 60 * 25 });
  return true;
}

export async function handleCreateIdea(request: Request, env: Env): Promise<Response> {
  const auth = await requireUser(request, env);
  if ('response' in auth) {
    return auth.response;
  }
  const { user } = auth;

  if (!user.emailVerified) {
    return json({ error: 'Please verify your email address first.' }, 403, request);
  }

  let payload: { title?: unknown; body?: unknown };
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Malformed request.' }, 400, request);
  }

  const title = typeof payload.title === 'string' ? payload.title.replace(/\s+/g, ' ').trim() : '';
  const body = typeof payload.body === 'string' ? payload.body.trim() : '';

  if (title.length < TITLE_MIN || title.length > TITLE_MAX) {
    return json({ error: `Title must be ${TITLE_MIN}–${TITLE_MAX} characters.` }, 400, request);
  }
  if (body.length < BODY_MIN || body.length > BODY_MAX) {
    return json({ error: `Description must be ${BODY_MIN}–${BODY_MAX} characters.` }, 400, request);
  }

  if (!(await checkAndCountSubmission(env, user.uid))) {
    return json(
      { error: `You have already shared ${DAILY_SUBMISSION_LIMIT} ideas today. Try again tomorrow.` },
      429,
      request
    );
  }

  const issueBody =
    `${body}\n\n---\n` +
    `_Submitted from the Hilltoppers extension by ${user.displayName}_\n` +
    `<!-- hilltoppers:author=${user.displayName} -->\n` +
    `<!-- hilltoppers:uid=${user.uid} -->`;

  const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/issues`, {
    method: 'POST',
    headers: { ...githubHeaders(env), 'Content-Type': 'application/json' },
    // Deliberately no labels: an unlabelled issue is an unreviewed one, and the
    // board only shows issues carrying BOARD_LABEL.
    body: JSON.stringify({ title, body: issueBody })
  });

  if (!res.ok) {
    console.error('[ideas] Failed to create issue', res.status, await res.text());
    return json({ error: 'Could not submit your idea right now.' }, 502, request);
  }

  const created = (await res.json()) as { number: number };
  return json({ ok: true, pending: true, number: created.number }, 201, request);
}

export async function handleVote(
  request: Request,
  env: Env,
  issueNumber: number,
  isAdd: boolean
): Promise<Response> {
  const auth = await requireUser(request, env);
  if ('response' in auth) {
    return auth.response;
  }
  const { user } = auth;

  let issues: CachedIdea[];
  try {
    issues = await getCachedIssues(env);
  } catch (error) {
    console.error('[ideas] Failed to load issues', error);
    return json({ error: 'Could not reach GitHub right now.' }, 502, request);
  }

  // Restricting to ideas on the board stops anyone voting on arbitrary issues
  // in the repository.
  const target = issues.find((issue) => issue.number === issueNumber);
  if (!target) {
    return json({ error: 'That idea does not exist.' }, 404, request);
  }

  if (isAdd) {
    // The (issue_number, uid) primary key makes a repeat vote a no-op.
    await env.IDEAS_DB.prepare(
      'INSERT OR IGNORE INTO votes (issue_number, uid, created_at) VALUES (?, ?, ?)'
    )
      .bind(issueNumber, user.uid, Date.now())
      .run();
  } else {
    await env.IDEAS_DB.prepare('DELETE FROM votes WHERE issue_number = ? AND uid = ?')
      .bind(issueNumber, user.uid)
      .run();
  }

  const row = await env.IDEAS_DB.prepare(
    'SELECT COUNT(*) AS n FROM votes WHERE issue_number = ?'
  )
    .bind(issueNumber)
    .first<{ n: number }>();

  return json(
    { votes: (row?.n ?? 0) + target.seedVotes, hasVoted: isAdd },
    200,
    request
  );
}
