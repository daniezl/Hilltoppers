import { describe, expect, test } from 'vitest';
import { extractCitedSources, retrieve } from './ask';
import { buildIndex, type Chunk, type Corpus, type ScoredChunk } from './retrieval';

function chunk(partial: Partial<Chunk> & Pick<Chunk, 'id'>): Chunk {
  return {
    source: 'page',
    title: 'Test',
    url: 'https://example.test',
    date: null,
    section: null,
    text: '',
    ...partial
  };
}

describe('extractCitedSources', () => {
  const passages: ScoredChunk[] = [
    { chunk: chunk({ id: 'a', title: 'Dress Code', url: 'https://x/dress' }), score: 3 },
    { chunk: chunk({ id: 'b', title: 'Daily Bulletin — 2026-09-03', url: 'https://x/bulletin', date: '2026-09-03', source: 'bulletin' }), score: 2 },
    { chunk: chunk({ id: 'c', title: 'Daily Bulletin — 2026-09-03', url: 'https://x/bulletin', date: '2026-09-03', source: 'bulletin' }), score: 1 }
  ];

  test('returns cited passages once per document, in citation order', () => {
    const sources = extractCitedSources('Hoodies are not allowed [1]. Chess club is Thursday [3][2].', passages);
    expect(sources.map((s) => s.n)).toEqual([1, 2]);
    expect(sources[1]).toMatchObject({ url: 'https://x/bulletin', date: '2026-09-03', kind: 'bulletin' });
  });

  test('ignores numbers that do not exist', () => {
    expect(extractCitedSources('See [7] and [12].', passages)).toEqual([]);
  });

  test('no citations, no sources', () => {
    expect(extractCitedSources('I could not find that in the school documents.', passages)).toEqual([]);
  });
});

describe('retrieve', () => {
  const corpus: Corpus = {
    updatedAt: '',
    chunks: [
      chunk({ id: 'dress', source: 'handbook', section: 'DRESS CODE', text: 'Jeans are not allowed.' }),
      chunk({ id: 'b1', source: 'bulletin', date: '2026-09-02', text: 'Golf at Jay Peak at 4:00.' }),
      chunk({ id: 'b2', source: 'bulletin', date: '2026-09-03', text: 'Pep Chapel tomorrow in the Alumni Gym.' }),
      chunk({ id: 'b2b', source: 'bulletin', date: '2026-09-03', text: 'Happy birthday to everyone.' })
    ]
  };
  const index = buildIndex(corpus);

  test('dated questions always see the newest bulletin, even when it does not match', () => {
    const hits = retrieve(index, 'when is golf', { keywords: 'golf jay peak', preferRecent: true, language: 'en' }, '2026-09-05');
    const ids = hits.map((h) => h.chunk.id);
    expect(ids[0]).toBe('b1');
    expect(ids).toContain('b2');
    expect(ids).toContain('b2b');
  });

  test('rule questions get only what matched', () => {
    const hits = retrieve(index, 'jeans', { keywords: 'jeans denim', preferRecent: false, language: 'en' }, '2026-09-05');
    expect(hits.map((h) => h.chunk.id)).toEqual(['dress']);
  });
});
