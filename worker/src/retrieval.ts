/**
 * Keyword search over corpus.json.
 *
 * BM25 rather than embeddings, on purpose. The corpus is a few hundred KB, the
 * questions are full of proper nouns ("Zen Zone", "Senior Sunrise", "Streeter
 * 225") that keyword matching gets right and small embedding models blur, and
 * DeepSeek — the only model this project talks to — has no embedding API. The
 * model's job before search is to translate the question into English search
 * terms (see ask.ts); the model's job after search is to read what came back.
 *
 * Pure: no fetch, no env. ask.ts owns loading and caching the corpus.
 */

export type ChunkSource = 'bulletin' | 'newsletter' | 'handbook' | 'page';

export interface Chunk {
  id: string;
  source: ChunkSource;
  title: string;
  url: string;
  /** "YYYY-MM-DD" the document was published, or null for undated policy. */
  date: string | null;
  section: string | null;
  text: string;
}

export interface Corpus {
  updatedAt: string;
  chunks: Chunk[];
}

export interface ScoredChunk {
  chunk: Chunk;
  score: number;
}

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'for', 'is', 'are', 'be', 'was',
  'were', 'it', 'its', 'this', 'that', 'these', 'those', 'with', 'by', 'from', 'as', 'do', 'does',
  'did', 'will', 'can', 'i', 'we', 'you', 'they', 'he', 'she', 'my', 'our', 'your', 'their',
  'what', 'when', 'where', 'who', 'how', 'which', 'there', 'here', 'about', 'into', 'not', 'no',
  'all', 'any', 'have', 'has', 'had', 'if', 'so', 'than', 'then', 'also', 'please', 'today',
  'school', 'sja', 'academy', 'student', 'students'
]);

/**
 * Enough stemming to make "meetings" find "meeting" and "closes" find
 * "closing". Crude, but it only has to agree with itself: the same function
 * runs over the documents and the query.
 */
function stem(token: string): string {
  let t = token;
  if (t.length <= 3) return t;
  if (t.endsWith('ies') && t.length > 4) return `${t.slice(0, -3)}y`;
  if (t.endsWith('s') && !t.endsWith('ss')) t = t.slice(0, -1);
  if (t.endsWith('ing') && t.length > 5) t = t.slice(0, -3);
  else if (t.endsWith('ed') && t.length > 4) t = t.slice(0, -2);
  if (t.endsWith('e') && t.length > 4) t = t.slice(0, -1);
  return t;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
}

interface IndexedChunk {
  chunk: Chunk;
  termFreq: Map<string, number>;
  length: number;
}

export interface Index {
  docs: IndexedChunk[];
  docFreq: Map<string, number>;
  avgLength: number;
}

export function buildIndex(corpus: Corpus): Index {
  const docs: IndexedChunk[] = [];
  const docFreq = new Map<string, number>();
  let totalLength = 0;

  for (const chunk of corpus.chunks) {
    // Title and section are searchable too: "DRESS CODE" as a heading is the
    // strongest signal a passage is about the dress code.
    const tokens = tokenize(`${chunk.title} ${chunk.section ?? ''} ${chunk.text}`);
    const termFreq = new Map<string, number>();
    for (const t of tokens) termFreq.set(t, (termFreq.get(t) ?? 0) + 1);
    for (const t of termFreq.keys()) docFreq.set(t, (docFreq.get(t) ?? 0) + 1);
    docs.push({ chunk, termFreq, length: tokens.length });
    totalLength += tokens.length;
  }

  return { docs, docFreq, avgLength: docs.length ? totalLength / docs.length : 1 };
}

const BM25_K1 = 1.4;
const BM25_B = 0.75;

export interface SearchOptions {
  limit?: number;
  /** Boost dated documents by recency; for questions about events and dates. */
  preferRecent?: boolean;
  /** "YYYY-MM-DD" used as "now" for recency; defaults to today (UTC). */
  today?: string;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

/**
 * Score every chunk against the query terms and return the best. Dated
 * documents decay: a bulletin from last spring should not outrank this week's
 * on a question about "the game on Friday", even when the words match better.
 */
export function search(index: Index, query: string, options: SearchOptions = {}): ScoredChunk[] {
  const limit = options.limit ?? 12;
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const terms = [...new Set(tokenize(query))];
  if (terms.length === 0) return [];

  const n = index.docs.length;
  const results: ScoredChunk[] = [];

  for (const doc of index.docs) {
    let score = 0;
    for (const term of terms) {
      const tf = doc.termFreq.get(term);
      if (!tf) continue;
      const df = index.docFreq.get(term) ?? 0;
      const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
      const norm = tf + BM25_K1 * (1 - BM25_B + (BM25_B * doc.length) / index.avgLength);
      score += idf * ((tf * (BM25_K1 + 1)) / norm);
    }
    if (score <= 0) continue;

    const { date } = doc.chunk;
    if (date) {
      const age = Math.max(0, daysBetween(date, today));
      // Always a little, much more when the question is about the calendar.
      const halfLife = options.preferRecent ? 21 : 180;
      const floor = options.preferRecent ? 0.25 : 0.7;
      score *= floor + (1 - floor) * Math.pow(0.5, age / halfLife);
    }

    results.push({ chunk: doc.chunk, score });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}
