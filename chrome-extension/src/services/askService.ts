import { getCurrentUser } from '../firebase/auth';

/**
 * The Ask box: one question in, one grounded answer out.
 *
 * Everything clever happens in the Worker (worker/src/ask.ts): it searches the
 * school's documents and has DeepSeek answer from them. This file is the
 * request, the error messages, and a small cache so an answer survives the
 * popup being closed — popups close the moment you click anywhere else, and a
 * six-second answer that vanishes is worse than none.
 */

export const ASK_API_BASE =
  import.meta.env.VITE_ASK_API_URL ||
  import.meta.env.VITE_IDEAS_API_URL ||
  'https://schedule-admin-api.danielzhang089.workers.dev';

export const ASK_QUESTION_MAX = 500;

/** Long enough for a click-away, short enough that yesterday's answer is not shown as today's. */
const LAST_ANSWER_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_KEY = 'askLast';

export interface AskSource {
  n: number;
  title: string;
  url: string;
  date: string | null;
  kind: 'bulletin' | 'newsletter' | 'handbook' | 'page';
}

export interface AskResult {
  question: string;
  answer: string;
  sources: AskSource[];
  askedAt: number;
}

export class AskError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'AskError';
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
    console.warn('[ask] Failed to get ID token', error);
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

export async function askQuestion(question: string): Promise<AskResult> {
  const trimmed = question.replace(/\s+/g, ' ').trim();
  if (!trimmed) {
    throw new AskError(400, 'Ask something first.');
  }
  if (trimmed.length > ASK_QUESTION_MAX) {
    throw new AskError(400, `Keep it under ${ASK_QUESTION_MAX} characters.`);
  }

  let response: Response;
  try {
    response = await fetch(`${ASK_API_BASE}/api/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ question: trimmed })
    });
  } catch {
    throw new AskError(0, 'No connection. Check your internet and try again.');
  }

  if (!response.ok) {
    throw new AskError(response.status, await readError(response));
  }

  const data = (await response.json()) as { answer?: string; sources?: AskSource[] };
  const result: AskResult = {
    question: trimmed,
    answer: (data.answer ?? '').trim(),
    sources: Array.isArray(data.sources) ? data.sources : [],
    askedAt: Date.now()
  };
  void saveLastAnswer(result);
  return result;
}

/**
 * Turns "…not allowed [1]. Tops must… [3]." into text and citation segments,
 * so the popup can render the numbers as small links to the sources.
 */
export type AnswerSegment = { type: 'text'; text: string } | { type: 'cite'; n: number };

export function splitCitations(answer: string): AnswerSegment[] {
  const segments: AnswerSegment[] = [];
  const re = /\[(\d{1,2})\]/g;
  let last = 0;
  for (const match of answer.matchAll(re)) {
    const index = match.index ?? 0;
    if (index > last) {
      segments.push({ type: 'text', text: answer.slice(last, index) });
    }
    segments.push({ type: 'cite', n: Number(match[1]) });
    last = index + match[0].length;
  }
  if (last < answer.length) {
    segments.push({ type: 'text', text: answer.slice(last) });
  }
  return segments;
}

/** "2026-09-03" → "Sep 3"; null → null. */
export function formatSourceDate(date: string | null): string | null {
  if (!date) {
    return null;
  }
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export async function loadLastAnswer(): Promise<AskResult | null> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return null;
  }
  try {
    const stored = await chrome.storage.local.get(CACHE_KEY);
    const cached = stored?.[CACHE_KEY] as AskResult | undefined;
    if (!cached || typeof cached.answer !== 'string' || Date.now() - cached.askedAt > LAST_ANSWER_TTL_MS) {
      return null;
    }
    return cached;
  } catch {
    return null;
  }
}

async function saveLastAnswer(result: AskResult): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return;
  }
  try {
    await chrome.storage.local.set({ [CACHE_KEY]: result });
  } catch {
    // Losing the cache only means asking again.
  }
}

export async function clearLastAnswer(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return;
  }
  try {
    await chrome.storage.local.remove(CACHE_KEY);
  } catch {
    // Nothing to do.
  }
}
