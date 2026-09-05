/**
 * POST /api/ask — answers questions about St. Johnsbury Academy from the
 * school's own documents.
 *
 * The flow is retrieve-then-read:
 *
 *   1. DeepSeek turns the question (any language) into English search terms
 *      and says whether the question is about something dated.
 *   2. BM25 over corpus.json (see retrieval.ts) picks the passages; when the
 *      question is dated, the newest Daily Bulletin is always included and
 *      recency counts for more.
 *   3. DeepSeek answers from those passages plus the next few weeks of the
 *      school calendar, citing passages as [n]; the citations become the
 *      source links the popup shows.
 *
 * Every question is logged as one JSON line (question, top score, whether an
 * answer was found) so `wrangler tail` shows what students ask that the
 * documents cannot answer — that list is where the next data source comes from.
 */

import { verifyFirebaseToken } from './firebaseAuth';
import { chat, parseJsonReply, DeepSeekError, DEFAULT_MODEL, type DeepSeekConfig } from './deepseek';
import { json } from './http';
import type { Env } from './index';
import { buildIndex, search, type Chunk, type Corpus, type Index, type ScoredChunk } from './retrieval';

const QUESTION_MIN = 2;
const QUESTION_MAX = 500;
const DAILY_LIMIT = 40;
const PASSAGE_LIMIT = 10;

const CORPUS_TTL_MS = 15 * 60 * 1000;
const CALENDAR_TTL_MS = 60 * 60 * 1000;
const CALENDAR_LOOKBACK_DAYS = 3;
const CALENDAR_HORIZON_DAYS = 45;

const SCHOOL_TIME_ZONE = 'America/New_York';

// ---------------------------------------------------------------------------
// Cached data from Cloudflare Pages. Module scope survives between requests
// on the same isolate, which is all the caching a few hundred KB needs.
// ---------------------------------------------------------------------------

let corpusCache: { index: Index; updatedAt: string; loadedAt: number; url: string } | null = null;
let calendarCache: { text: string; loadedAt: number; url: string } | null = null;

async function loadIndex(env: Env): Promise<{ index: Index; updatedAt: string }> {
  const url = env.CORPUS_URL;
  if (corpusCache && corpusCache.url === url && Date.now() - corpusCache.loadedAt < CORPUS_TTL_MS) {
    return corpusCache;
  }
  const res = await fetch(url, { cf: { cacheTtl: 600, cacheEverything: true } } as RequestInit);
  if (!res.ok) throw new Error(`corpus.json returned ${res.status}`);
  const corpus = (await res.json()) as Corpus;
  if (!Array.isArray(corpus.chunks)) throw new Error('corpus.json has no chunks array');
  corpusCache = { index: buildIndex(corpus), updatedAt: corpus.updatedAt, loadedAt: Date.now(), url };
  return corpusCache;
}

interface CalendarEvent {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
  url?: string;
}

function schoolToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: SCHOOL_TIME_ZONE });
}

function weekdayOf(ymd: string): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
}

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * The structured calendar answers "when is X" far more reliably than prose
 * does, and it is small enough to hand the model whole for the coming weeks.
 */
async function loadCalendarContext(env: Env, today: string): Promise<string> {
  const url = env.EVENTS_URL;
  if (calendarCache && calendarCache.url === url && Date.now() - calendarCache.loadedAt < CALENDAR_TTL_MS) {
    return calendarCache.text;
  }

  const lines: string[] = [];
  try {
    const [eventsRes, dayTypeRes] = await Promise.all([
      fetch(url, { cf: { cacheTtl: 1800, cacheEverything: true } } as RequestInit),
      fetch(env.DAY_TYPE_URL, { cf: { cacheTtl: 1800, cacheEverything: true } } as RequestInit)
    ]);

    if (eventsRes.ok) {
      const { events } = (await eventsRes.json()) as { events: CalendarEvent[] };
      const from = addDays(today, -CALENDAR_LOOKBACK_DAYS);
      const to = addDays(today, CALENDAR_HORIZON_DAYS);
      for (const ev of events) {
        if (ev.end < from || ev.start > to) continue;
        const when = ev.start === ev.end ? `${ev.start} (${weekdayOf(ev.start)})` : `${ev.start} to ${ev.end}`;
        const time = !ev.allDay && ev.startTime ? ` ${ev.startTime}${ev.endTime ? `–${ev.endTime}` : ''}` : '';
        lines.push(`- ${when}${time}: ${ev.title}`);
      }
    }

    if (dayTypeRes.ok) {
      const { days } = (await dayTypeRes.json()) as { days: Record<string, string> };
      const upcoming = Object.entries(days)
        .filter(([date]) => date >= today)
        .sort()
        .slice(0, 10)
        .map(([date, type]) => `${date} ${weekdayOf(date).slice(0, 3)}=${type}`);
      if (upcoming.length) lines.push(`Day colours: ${upcoming.join(', ')}`);
    }
  } catch (error) {
    console.warn('[ask] calendar unavailable', error);
  }

  const text = lines.length ? lines.join('\n') : '(calendar unavailable)';
  calendarCache = { text, loadedAt: Date.now(), url };
  return text;
}

// ---------------------------------------------------------------------------
// Step 1: question → search terms
// ---------------------------------------------------------------------------

interface QueryPlan {
  keywords: string;
  preferRecent: boolean;
  language: string;
}

const REWRITE_SYSTEM = `You prepare search queries for a keyword index of St. Johnsbury Academy (SJA, a Vermont high school) documents: daily bulletins, the weekly "SJA News" email, the student handbook, the dress code page, athletics policies.

Given a student's question in any language, reply with JSON only:
{"keywords": "<8-20 English search words: the key nouns from the question, plus synonyms and the wording the school would use>", "preferRecent": <true if the question is about an event, date, deadline, game, meeting, sign-up, schedule for a particular day, or anything else that changes week to week; false for standing rules and general information>, "language": "<BCP-47 code of the question's language, e.g. en, zh, es>"}

Examples:
Q: "hoodie 在不在 dress code 里?" → {"keywords":"dress code hoodie hooded sweatshirt crewneck sweater tops allowed not allowed","preferRecent":false,"language":"zh"}
Q: "when is senior sunrise" → {"keywords":"senior sunrise seniors morning date time","preferRecent":true,"language":"en"}
Q: "图书馆什么时候关门" → {"keywords":"library hours open close closing time Grace Stuart Orcutt Library Mayo Center","preferRecent":false,"language":"zh"}`;

async function planQuery(config: DeepSeekConfig, question: string): Promise<QueryPlan> {
  const fallback: QueryPlan = { keywords: '', preferRecent: /\b(when|date|time|today|tomorrow|week|friday|monday|tuesday|wednesday|thursday|saturday|sunday)\b/i.test(question) || /什么时候|几号|哪天|日期|今天|明天|本周|周[一二三四五六日]/.test(question), language: 'en' };
  try {
    const raw = await chat(config, [
      { role: 'system', content: REWRITE_SYSTEM },
      { role: 'user', content: `Q: ${JSON.stringify(question)} → json:` }
    ], { json: true, temperature: 0, maxTokens: 200 });
    const parsed = parseJsonReply<Partial<QueryPlan>>(raw);
    return {
      keywords: typeof parsed.keywords === 'string' ? parsed.keywords : fallback.keywords,
      preferRecent: typeof parsed.preferRecent === 'boolean' ? parsed.preferRecent : fallback.preferRecent,
      language: typeof parsed.language === 'string' ? parsed.language : fallback.language
    };
  } catch (error) {
    // Search on the raw question rather than fail: English questions still work.
    console.warn('[ask] query rewrite failed', error);
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Step 2: retrieve
// ---------------------------------------------------------------------------

function latestBulletinChunks(index: Index): Chunk[] {
  let latest: string | null = null;
  for (const { chunk } of index.docs) {
    if (chunk.source === 'bulletin' && chunk.date && (!latest || chunk.date > latest)) latest = chunk.date;
  }
  if (!latest) return [];
  return index.docs.map((d) => d.chunk).filter((c) => c.source === 'bulletin' && c.date === latest);
}

export function retrieve(index: Index, question: string, plan: QueryPlan, today: string): ScoredChunk[] {
  const hits = search(index, `${question} ${plan.keywords}`, {
    limit: PASSAGE_LIMIT,
    preferRecent: plan.preferRecent,
    today
  });

  if (!plan.preferRecent) return hits;

  // Today's bulletin is where "tomorrow" and "this Friday" live; a question
  // about the calendar should always be able to see it.
  const seen = new Set(hits.map((h) => h.chunk.id));
  const extras = latestBulletinChunks(index)
    .filter((c) => !seen.has(c.id))
    .map((chunk) => ({ chunk, score: 0 }));
  return [...hits, ...extras].slice(0, PASSAGE_LIMIT + extras.length);
}

// ---------------------------------------------------------------------------
// Step 3: answer
// ---------------------------------------------------------------------------

const SOURCE_LABEL: Record<Chunk['source'], string> = {
  bulletin: 'Daily Bulletin',
  newsletter: 'SJA News email',
  handbook: 'Handbook / PDF',
  page: 'School website'
};

function describe(chunk: Chunk): string {
  const parts = [SOURCE_LABEL[chunk.source] ?? chunk.source, chunk.title];
  if (chunk.date) parts.push(`written ${chunk.date} (${weekdayOf(chunk.date)})`);
  else parts.push('current policy, undated');
  if (chunk.section) parts.push(`section: ${chunk.section}`);
  return parts.join(' — ');
}

function answerSystemPrompt(today: string): string {
  return `You are the Hilltoppers assistant for students at St. Johnsbury Academy (SJA), Vermont. Today is ${weekdayOf(today)}, ${today} (school time zone America/New_York).

Answer the question using ONLY the calendar and the numbered passages provided. Rules:
- If they do not contain the answer, say so plainly in one sentence and name the best place to check (the Daily Bulletin, the SJA News email, the Student Handbook, or the school office). Never guess or use outside knowledge about SJA.
- Every passage states when it was written. Resolve relative words in a passage ("tomorrow", "Friday night", "next week") against that passage's own date, and give the absolute date in your answer. When passages conflict, the most recently written one wins for events; for rules such as dress code or attendance, the Dress Code page and the Student Handbook win over older emails.
- Reply in the same language as the question. Be brief: one to four sentences, or a short list if the question asks for several items.
- After each sentence or item that relies on a passage, cite it as [n] using the passage's number. Cite only numbers that exist. Do not cite the calendar.`;
}

function buildUserMessage(question: string, calendar: string, passages: ScoredChunk[]): string {
  const blocks = passages.map((p, i) => `[${i + 1}] ${describe(p.chunk)}\n${p.chunk.text}`);
  return `School calendar for the coming weeks (from the official events feed):\n${calendar}\n\nPassages:\n${blocks.join('\n\n')}\n\nQuestion: ${question}`;
}

export interface AskSource {
  n: number;
  title: string;
  url: string;
  date: string | null;
  kind: Chunk['source'];
}

export function extractCitedSources(answer: string, passages: ScoredChunk[]): AskSource[] {
  const cited = new Set<number>();
  for (const m of answer.matchAll(/\[(\d{1,2})\]/g)) cited.add(Number(m[1]));
  const sources: AskSource[] = [];
  const seenUrls = new Set<string>();
  for (const n of [...cited].sort((a, b) => a - b)) {
    const p = passages[n - 1];
    if (!p) continue;
    const key = `${p.chunk.url}|${p.chunk.date ?? ''}`;
    if (seenUrls.has(key)) continue;
    seenUrls.add(key);
    sources.push({ n, title: p.chunk.title, url: p.chunk.url, date: p.chunk.date, kind: p.chunk.source });
  }
  return sources;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

async function checkAndCountQuestion(env: Env, key: string): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10);
  const kvKey = `ask:count:${key}:${day}`;
  const used = Number((await env.SCHEDULE_KV.get(kvKey)) ?? '0');
  if (used >= DAILY_LIMIT) return false;
  await env.SCHEDULE_KV.put(kvKey, String(used + 1), { expirationTtl: 60 * 60 * 25 });
  return true;
}

export async function handleAsk(request: Request, env: Env): Promise<Response> {
  if (!env.DEEPSEEK_API_KEY) {
    return json({ error: 'Ask is not set up on this server yet.' }, 503, request);
  }
  const config: DeepSeekConfig = {
    apiKey: env.DEEPSEEK_API_KEY,
    model: env.DEEPSEEK_MODEL || DEFAULT_MODEL,
    url: env.DEEPSEEK_URL
  };

  let payload: { question?: unknown };
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Malformed request.' }, 400, request);
  }
  const question = typeof payload.question === 'string' ? payload.question.replace(/\s+/g, ' ').trim() : '';
  if (question.length < QUESTION_MIN) {
    return json({ error: 'Ask something first.' }, 400, request);
  }
  if (question.length > QUESTION_MAX) {
    return json({ error: `Keep questions under ${QUESTION_MAX} characters.` }, 400, request);
  }

  // Signed-in users are counted per account; everyone else per IP. Signing
  // in is not required — the popup works signed out — but the cap stops a
  // script from running up the DeepSeek bill.
  const user = await verifyFirebaseToken(request, env.FIREBASE_PROJECT_ID);
  const limitKey = user ? `uid:${user.uid}` : `ip:${request.headers.get('CF-Connecting-IP') ?? 'unknown'}`;
  if (!(await checkAndCountQuestion(env, limitKey))) {
    return json({ error: `That is ${DAILY_LIMIT} questions today — try again tomorrow.` }, 429, request);
  }

  const today = schoolToday();

  let index: Index;
  let corpusUpdatedAt: string;
  try {
    ({ index, updatedAt: corpusUpdatedAt } = await loadIndex(env));
  } catch (error) {
    console.error('[ask] corpus unavailable', error);
    return json({ error: 'The school documents could not be loaded right now.' }, 502, request);
  }

  const [plan, calendar] = await Promise.all([planQuery(config, question), loadCalendarContext(env, today)]);
  const passages = retrieve(index, question, plan, today);

  let answer: string;
  try {
    answer = (await chat(config, [
      { role: 'system', content: answerSystemPrompt(today) },
      { role: 'user', content: buildUserMessage(question, calendar, passages) }
    ], { temperature: 0.2, maxTokens: 700 })).trim();
  } catch (error) {
    console.error('[ask] answer failed', error);
    const status = error instanceof DeepSeekError && error.status === 429 ? 429 : 502;
    return json({ error: 'The assistant is unavailable right now. Try again in a minute.' }, status, request);
  }

  const sources = extractCitedSources(answer, passages);

  console.log(JSON.stringify({
    kind: 'ask',
    question,
    language: plan.language,
    preferRecent: plan.preferRecent,
    keywords: plan.keywords,
    topScore: passages[0]?.score ?? 0,
    passages: passages.length,
    cited: sources.length,
    signedIn: Boolean(user)
  }));

  return json({ answer, sources, corpusUpdatedAt, model: config.model }, 200, request);
}
