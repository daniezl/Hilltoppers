import { handleAsk } from './ask';
import { json } from './http';

export interface Env {
  ASSETS: Fetcher;
  QUESTION_LIMITER: RateLimit;
  GLOBAL_LIMITER: RateLimit;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_MODEL: string;
  DEEPSEEK_URL?: string;
  EVENTS_URL: string;
  DAY_TYPE_URL: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') {
      return json({ ok: true, configured: Boolean(env.DEEPSEEK_API_KEY), service: 'ask-sja' }, 200);
    }
    if (url.pathname === '/api/ask') {
      if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
      // The independent webpage calls its own backend, including inside an iframe.
      const origin = request.headers.get('Origin');
      if (origin && origin !== url.origin) return json({ error: 'Open Ask SJA to ask a question.' }, 403);
      if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'Expected JSON.' }, 415);
      const bytes = Number(request.headers.get('Content-Length') ?? 0);
      if (bytes > 49152) return json({ error: 'Conversation is too large.' }, 413);
      // Bound chunked bodies as well as requests with a Content-Length header.
      const reader = request.body?.getReader();
      if (!reader) return json({ error: 'Ask something first.' }, 400);
      const chunks: Uint8Array[] = [];
      let length = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 49152) { await reader.cancel(); return json({ error: 'Conversation is too large.' }, 413); }
        chunks.push(value);
      }
      const body = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
      const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
      const localLimit = await env.QUESTION_LIMITER.limit({ key: ip });
      const globalLimit = localLimit.success && await env.GLOBAL_LIMITER.limit({ key: 'ask-sja' });
      if (!localLimit.success || !globalLimit || !globalLimit.success) return json({ error: 'Too many questions right now. Please try again in a minute.' }, 429);
      try {
        return await handleAsk(new Request(request.url, { method: 'POST', headers: request.headers, body }), env);
      } catch {
        return json({ error: 'Ask SJA is unavailable right now. Please try again.' }, 502);
      }
    }
    if (url.pathname.startsWith('/api/')) return json({ error: 'Not found.' }, 404);
    const asset = await env.ASSETS.fetch(request);
    const response = new Response(asset.body, asset);
    response.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'");
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    // No X-Frame-Options: this page is deliberately embeddable by topping hosts.
    response.headers.set('Cache-Control', 'no-cache');
    return response;
  }
};
