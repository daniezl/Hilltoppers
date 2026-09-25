import { afterEach, describe, expect, test, vi } from 'vitest';
import worker, { type Env } from './index';

function environment(configured = false): Env {
  return {
    ASSETS: { fetch: async () => new Response('<h1>Ask SJA</h1>') } as unknown as Fetcher,
    QUESTION_LIMITER: { limit: async () => ({ success: true }) } as RateLimit,
    GLOBAL_LIMITER: { limit: async () => ({ success: true }) } as RateLimit,
    DEEPSEEK_API_KEY: configured ? 'test-key-not-real' : undefined,
    DEEPSEEK_MODEL: 'test-model', EVENTS_URL: 'https://data.test/events', DAY_TYPE_URL: 'https://data.test/days'
  };
}
function request(body: unknown, origin = 'https://ask.test') {
  return new Request('https://ask.test/api/ask', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('independent Ask SJA backend', () => {
  test('reports missing configuration honestly without calling the model', async () => {
    const fetchSpy = vi.fn(); vi.stubGlobal('fetch', fetchSpy);
    const response = await worker.fetch(request({ question: 'When does the library close?' }), environment());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Ask is not set up on this server yet.' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  test('rejects another website posting directly to the API', async () => {
    expect((await worker.fetch(request({ question: 'hello' }, 'https://other.test'), environment())).status).toBe(403);
  });
  test('rejects oversized bodies even without Content-Length', async () => {
    expect((await worker.fetch(request({ question: 'x'.repeat(50000) }), environment())).status).toBe(413);
  });
  test('handles null JSON without crashing', async () => {
    expect((await worker.fetch(request(null), environment(true))).status).toBe(400);
  });
  test('enforces the rate limiter before model work', async () => {
    const env = environment(true);
    env.QUESTION_LIMITER = { limit: async () => ({ success: false }) } as RateLimit;
    expect((await worker.fetch(request({ question: 'hello' }), env)).status).toBe(429);
  });
  test('serves embeddable assets while restricting page connections to its own server', async () => {
    const response = await worker.fetch(new Request('https://ask.test/'), environment());
    expect(response.headers.get('Content-Security-Policy')).toContain("connect-src 'self'");
    expect(response.headers.has('X-Frame-Options')).toBe(false);
    expect(response.headers.get('Cache-Control')).toBe('no-cache');
  });
  test('passes history to both query rewriting and grounded answering', async () => {
    const env = environment(true);
    env.ASSETS = { fetch: async () => Response.json({ updatedAt: '2026-09-16', chunks: [{ id: 'library', text: 'The library closes at 4:00 p.m.', title: 'Library hours', source: 'page', url: 'https://school.test/library', date: null, section: null }] }) } as unknown as Fetcher;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('deepseek.com')) {
        expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-key-not-real');
        const payload = JSON.parse(String(init?.body));
        expect(payload.messages[1]).toEqual({ role: 'user', content: 'When does the library close?' });
        expect(payload.messages[2]).toEqual({ role: 'assistant', content: 'The library closes at 4:00 p.m.' });
        expect(payload.messages.at(-1).content).toContain('What about Fridays?');
        return Response.json({ choices: [{ message: { content: payload.response_format ? JSON.stringify({ keywords: 'library closing hours', preferRecent: false, language: 'en' }) : 'The library closes at 4:00 p.m. [1]' } }] });
      }
      return Response.json(url.endsWith('/events') ? { events: [] } : { days: {} });
    });
    vi.stubGlobal('fetch', fetchMock);
    const logs = vi.spyOn(console, 'log').mockImplementation(() => {});
    const response = await worker.fetch(request({ question: 'What about Fridays?', history: [{ role: 'user', content: 'When does the library close?' }, { role: 'assistant', content: 'The library closes at 4:00 p.m. [1]' }] }), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ answer: 'The library closes at 4:00 p.m. [1]', sources: [{ n: 1, url: 'https://school.test/library' }] });
    expect(JSON.stringify(logs.mock.calls)).not.toContain('When does the library close?');
    expect(fetchMock.mock.calls.filter(call => String(call[0]).includes('deepseek.com'))).toHaveLength(2);
  });
});
