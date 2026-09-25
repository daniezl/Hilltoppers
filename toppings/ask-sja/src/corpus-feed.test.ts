import { afterEach, expect, test, vi } from 'vitest';
import type { Env } from './index';

const corpus = (text: string) => ({ updatedAt: text, chunks: [{ id: text, text, source: 'page', title: text, url: 'https://school.test', date: null, section: null }] });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); });

test('refreshes the remote feed after 15 minutes and keeps it through an outage', async () => {
  vi.resetModules();
  vi.useFakeTimers();
  const { loadIndex } = await import('./ask');
  const assets = vi.fn();
  const env = { CORPUS_URL: 'https://data.test/corpus.json', ASSETS: { fetch: assets } } as unknown as Env;
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(corpus('first')))
    .mockResolvedValueOnce(Response.json(corpus('new')))
    .mockResolvedValueOnce(Response.json({ chunks: [] }));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect((await loadIndex(env)).updatedAt).toBe('first');
  await loadIndex(env);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(15 * 60 * 1000);
  expect((await loadIndex(env)).updatedAt).toBe('new');
  vi.advanceTimersByTime(15 * 60 * 1000);
  expect((await loadIndex(env)).updatedAt).toBe('new');
  expect(assets).not.toHaveBeenCalled();
});

test('cold start falls back to bundled documents and later retries the feed', async () => {
  vi.resetModules();
  vi.useFakeTimers();
  const { loadIndex } = await import('./ask');
  const env = { CORPUS_URL: 'https://data.test/corpus.json', ASSETS: { fetch: vi.fn().mockResolvedValue(Response.json(corpus('bundled'))) } } as unknown as Env;
  vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(Response.json(corpus('online'))));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect((await loadIndex(env)).updatedAt).toBe('bundled');
  vi.advanceTimersByTime(15 * 60 * 1000);
  expect((await loadIndex(env)).updatedAt).toBe('online');
});
