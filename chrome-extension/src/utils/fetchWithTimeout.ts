/**
 * How long a network request may hang before we give up on it.
 *
 * Chosen for the moment a Chromebook lid opens: Wi-Fi is still reconnecting,
 * and a fetch started then can sit for minutes without failing. Everything in
 * the background that waits on that fetch — the toolbar icon in particular —
 * stays frozen for exactly as long. Eight seconds is long enough for a slow
 * school network to answer and short enough that a stale icon is a blink,
 * not a complaint.
 */
export const NETWORK_TIMEOUT_MS = 8000;

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = NETWORK_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
