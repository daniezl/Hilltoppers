/**
 * Pages Function to proxy API requests to Worker
 * This forwards /api/* requests to the Worker
 */

export async function onRequest(context: {
  request: Request;
  env: {
    WORKER_URL?: string;
  };
}): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);
  
  // Worker URL
  const workerUrl = env.WORKER_URL || 'https://schedule-admin-api.danielzhang089.workers.dev';
  
  // 构建 Worker 的完整 URL（保留路径）
  const workerRequestUrl = `${workerUrl}${url.pathname}${url.search}`;
  
  // 转发请求到 Worker，保留所有 headers
  const workerRequest = new Request(workerRequestUrl, {
    method: request.method,
    headers: request.headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
  });
  
  try {
    const response = await fetch(workerRequest);
    
    // 返回 Worker 的响应
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to reach Worker' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

