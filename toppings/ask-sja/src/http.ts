export function json(data: unknown, status: number, _request?: Request): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}
