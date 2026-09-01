import { getCurrentUser } from '../firebase/auth';

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

export const IDEAS_SITE_URL =
  import.meta.env.VITE_IDEAS_SITE_URL || 'https://hilltoppers-ideas.pages.dev';

export const IDEAS_SUBMIT_URL = `${IDEAS_SITE_URL}/new`;

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

/**
 * Ranks new ideas above the rest, then by votes within each group.
 *
 * Handling "new" as the first sort key rather than reserving fixed slots means
 * the empty cases take care of themselves: with nothing new, all five slots go
 * to the most-wanted ideas instead of sitting unused.
 */
export function sortForPopup(ideas: Idea[]): Idea[] {
  const now = Date.now();
  return [...ideas]
    .sort((a, b) => {
      const aNew = isNewIdea(a, now);
      const bNew = isNewIdea(b, now);
      if (aNew !== bNew) {
        return aNew ? -1 : 1;
      }
      return b.votes - a.votes;
    })
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
