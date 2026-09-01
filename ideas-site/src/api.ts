import { getIdToken } from './auth';
import { IDEAS_API_BASE } from './config';

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

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
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
    throw new ApiError(response.status, await readError(response));
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
    throw new ApiError(401, 'Please sign in first.');
  }
  const response = await fetch(`${IDEAS_API_BASE}/api/ideas/${issueNumber}/vote`, {
    method: isAdd ? 'POST' : 'DELETE',
    headers
  });
  if (!response.ok) {
    throw new ApiError(response.status, await readError(response));
  }
  return (await response.json()) as { votes: number; hasVoted: boolean };
}

export async function createIdea(title: string, body: string): Promise<void> {
  const headers = await authHeaders();
  if (!headers.Authorization) {
    throw new ApiError(401, 'Please sign in first.');
  }
  const response = await fetch(`${IDEAS_API_BASE}/api/ideas`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body })
  });
  if (!response.ok) {
    throw new ApiError(response.status, await readError(response));
  }
}
