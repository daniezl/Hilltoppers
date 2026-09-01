/**
 * CORS helpers for the public ideas endpoints.
 *
 * These are separate from the admin helpers in index.ts because the ideas API
 * is called from the extension (chrome-extension://) and the public ideas site,
 * neither of which is in the admin allowlist.
 */

function isAllowedOrigin(origin: string): boolean {
  if (origin.startsWith('chrome-extension://')) {
    return true;
  }
  if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
    return true;
  }
  try {
    const { protocol, hostname } = new URL(origin);
    return protocol === 'https:' && (hostname === 'pages.dev' || hostname.endsWith('.pages.dev'));
  } catch {
    return false;
  }
}

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin');
  return {
    // No cookies are involved (the ID token travels in the Authorization
    // header), so falling back to '*' is safe for unknown origins.
    'Access-Control-Allow-Origin': origin && isAllowedOrigin(origin) ? origin : '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
}

export function json(data: unknown, status: number, request: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(request)
    }
  });
}

export function preflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}
