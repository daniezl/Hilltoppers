import { getCurrentUser } from '../firebase/auth';

/**
 * IDEAS IS PAUSED. This is the one switch.
 *
 * The ideas board (vote on feature ideas from the popup, backed by GitHub
 * issues and a Cloudflare Worker) is complete and worked, but is switched off
 * while the rest of the project is being restructured. Nothing here is broken
 * and nothing is half-finished — it is off on purpose, from this one line.
 *
 * While false: the Ideas section does not render in the popup, and no request
 * to the Worker is ever made. All of the code below stays compiled and
 * type-checked, so it cannot rot the way commented-out code does.
 *
 * To turn it back on:
 *   1. Set this to true.
 *   2. Re-add "https://schedule-admin-api.danielzhang089.workers.dev/*" to
 *      host_permissions in manifest.json (removed so a paused feature does not
 *      hold a permission).
 *   3. Deploy the Worker if it was taken down (worker/README.md), then
 *      npm run build.
 *
 * Do not delete this code to "clean up". The Worker, its D1 votes table and the
 * moderation flow in worker/ are the other half; this is the client.
 */
export const IDEAS_ENABLED = false;

export type IdeaStatus = 'open' | 'in-progress' | 'shipped' | 'declined';

export interface Idea {
  number: number;
  title: string;
  body: string;
  author: string | null;
  status: IdeaStatus;
  votes: number;
  hasVoted: boolean;
  url: string;
  createdAt: string;
}

const IDEAS_API_BASE =
  import.meta.env.VITE_IDEAS_API_URL || 'https://schedule-admin-api.danielzhang089.workers.dev';

const CACHE_KEY = 'ideasCache';
const POPUP_IDEA_COUNT = 5;

/**
 * An idea counts as new for a week. Submissions arrive a few at a time, so a
 * shorter window would leave the NEW slot empty most of the time.
 */
const NEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export class IdeasError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'IdeasError';
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const user = getCurrentUser();
  if (!user) {
    return {};
  }
  try {
    return { Authorization: `Bearer ${await user.getIdToken()}` };
  } catch (error) {
    console.warn('[ideas] Failed to get ID token', error);
    return {};
  }
}

async function readError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? 'Something went wrong.';
  } catch {
    return 'Something went wrong.';
  }
}

export async function fetchIdeas(): Promise<Idea[]> {
  const response = await fetch(`${IDEAS_API_BASE}/api/ideas`, {
    headers: await authHeaders()
  });
  if (!response.ok) {
    throw new IdeasError(response.status, await readError(response));
  }
  const data = (await response.json()) as { ideas?: Idea[] };
  return data.ideas ?? [];
}

export async function setVote(
  issueNumber: number,
  isAdd: boolean
): Promise<{ votes: number; hasVoted: boolean }> {
  const headers = await authHeaders();
  if (!headers.Authorization) {
    throw new IdeasError(401, 'Please sign in first.');
  }

  const response = await fetch(`${IDEAS_API_BASE}/api/ideas/${issueNumber}/vote`, {
    method: isAdd ? 'POST' : 'DELETE',
    headers
  });
  if (!response.ok) {
    throw new IdeasError(response.status, await readError(response));
  }
  return (await response.json()) as { votes: number; hasVoted: boolean };
}

export function isNewIdea(idea: Idea, now = Date.now()): boolean {
  return now - Date.parse(idea.createdAt) < NEW_WINDOW_MS;
}

function isFinished(idea: Idea): boolean {
  return idea.status === 'shipped' || idea.status === 'declined';
}

/**
 * Groups ideas as new, then still open, then finished; votes break ties inside
 * each group.
 *
 * Handling this as sort keys rather than reserving fixed slots means the empty
 * cases take care of themselves: with nothing new, all five slots go to the
 * most-wanted ideas instead of sitting unused. Finished ideas rank last because
 * a popular shipped idea would otherwise hold a slot nobody can act on — they
 * are still worth showing, just not ahead of what is still up for grabs.
 */
function popupRank(idea: Idea, now: number): number {
  if (isFinished(idea)) {
    return 2;
  }
  return isNewIdea(idea, now) ? 0 : 1;
}

export function sortForPopup(ideas: Idea[]): Idea[] {
  const now = Date.now();
  return [...ideas]
    .sort((a, b) => popupRank(a, now) - popupRank(b, now) || b.votes - a.votes)
    .slice(0, POPUP_IDEA_COUNT);
}

export async function loadCachedIdeas(): Promise<Idea[] | null> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return null;
  }
  try {
    const stored = await chrome.storage.local.get(CACHE_KEY);
    const cached = stored?.[CACHE_KEY] as { ideas?: Idea[] } | undefined;
    return cached?.ideas ?? null;
  } catch {
    return null;
  }
}

export async function saveCachedIdeas(ideas: Idea[]): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return;
  }
  try {
    await chrome.storage.local.set({ [CACHE_KEY]: { ideas, cachedAt: Date.now() } });
  } catch {
    // A full cache is not worth failing the render over.
  }
}
