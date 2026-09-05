/**
 * Minimal DeepSeek chat client. The API is OpenAI-shaped, so this is a fetch
 * and a JSON parse rather than a dependency.
 *
 * Model ids: `deepseek-v4-flash` (default here) and `deepseek-v4-pro`. The old
 * `deepseek-chat` / `deepseek-reasoner` names were retired in July 2026 and now
 * return errors, which is why the id is a Worker var and not a constant.
 *
 * Thinking is switched off for both calls ask.ts makes: the query rewrite is
 * trivial and the answer is grounded in supplied passages, so reasoning tokens
 * would only add seconds to a popup that is waiting.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface DeepSeekConfig {
  apiKey: string;
  model: string;
  /** Overrides DEEPSEEK_URL; only for pointing `wrangler dev` at a mock. */
  url?: string;
}

export const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
export const DEFAULT_MODEL = 'deepseek-v4-flash';

interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
}

export class DeepSeekError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'DeepSeekError';
  }
}

export async function chat(
  config: DeepSeekConfig,
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<string> {
  const body: Record<string, unknown> = {
    model: config.model || DEFAULT_MODEL,
    messages,
    temperature: options.temperature ?? 0.2,
    max_tokens: options.maxTokens ?? 1024,
    stream: false,
    thinking: { type: 'disabled' }
  };
  if (options.json) {
    body.response_format = { type: 'json_object' };
  }

  const res = await fetch(config.url || DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    throw new DeepSeekError(res.status, `DeepSeek returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new DeepSeekError(502, 'DeepSeek returned no message content');
  }
  return content;
}

/** JSON mode still occasionally wraps output in a code fence; strip it before parsing. */
export function parseJsonReply<T>(raw: string): T {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(trimmed) as T;
}
