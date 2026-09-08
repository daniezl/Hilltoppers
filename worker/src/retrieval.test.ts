import { describe, expect, test } from 'vitest';
import { buildIndex, search, tokenize, type Chunk, type Corpus } from './retrieval';

function chunk(partial: Partial<Chunk> & Pick<Chunk, 'id' | 'text'>): Chunk {
  return {
    source: 'page',
    title: 'Test',
    url: 'https://example.test',
    date: null,
    section: null,
    ...partial
  };
}

const corpus: Corpus = {
  updatedAt: '2026-09-05T00:00:00Z',
  chunks: [
    chunk({
      id: 'dress',
      source: 'handbook',
      section: 'DRESS CODE',
      text: 'Tops should be a solid color. Hooded or crewneck sweatshirts are not allowed. Jeans/denim of any kind are not allowed.'
    }),
    chunk({
      id: 'library',
      source: 'handbook',
      section: 'LIBRARY',
      text: 'The Grace Stuart Orcutt Library is open from 7:30 a.m. until 4:00 p.m. on school days.'
    }),
    chunk({
      id: 'old-bulletin',
      source: 'bulletin',
      date: '2026-03-12',
      text: 'Chess Club meets today at 3:15 in Streeter 225. Senior Sunrise photos are on the website.'
    }),
    chunk({
      id: 'new-bulletin',
      source: 'bulletin',
      date: '2026-09-03',
      text: 'Chess Club meets today at 3:15 in Streeter 225. Seniors: Senior Sunrise is tomorrow at 5:30am.'
    })
  ]
};

describe('tokenize', () => {
  test('lowercases, drops stopwords and punctuation, stems plurals and -ing', () => {
    expect(tokenize("The Seniors' meetings are closing at Streeter 225!")).toEqual([
      'senior', 'meet', 'clos', 'streeter', '225'
    ]);
  });
});

describe('search', () => {
  const index = buildIndex(corpus);

  test('finds the passage by keyword and section heading', () => {
    const hits = search(index, 'hoodie hooded sweatshirt dress code', { today: '2026-09-05' });
    expect(hits[0].chunk.id).toBe('dress');
  });

  test('library hours', () => {
    const hits = search(index, 'library open close hours', { today: '2026-09-05' });
    expect(hits[0].chunk.id).toBe('library');
  });

  test('prefers the newer bulletin when two match equally and recency is requested', () => {
    const hits = search(index, 'chess club', { preferRecent: true, today: '2026-09-05' });
    expect(hits.map((h) => h.chunk.id)).toEqual(['new-bulletin', 'old-bulletin']);
    expect(hits[0].score).toBeGreaterThan(hits[1].score * 2);
  });

  test('undated policy is not penalised', () => {
    const hits = search(index, 'jeans denim', { preferRecent: true, today: '2026-09-05' });
    expect(hits[0].chunk.id).toBe('dress');
  });

  test('empty or all-stopword queries return nothing', () => {
    expect(search(index, 'the of and', {})).toEqual([]);
    expect(search(index, '', {})).toEqual([]);
  });

  test('respects the limit', () => {
    expect(search(index, 'chess senior library dress', { limit: 2 })).toHaveLength(2);
  });
});
