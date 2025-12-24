/**
 * Pages Function to proxy API requests to Worker
 */

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  // Worker URL
  const workerUrl = env.WORKER_URL || 'https://schedule-admin-api.danielzhang089.workers.dev';
  
  // 构建 Worker 的完整 URL
  const workerRequestUrl = `${workerUrl}${url.pathname}${url.search}`;
  
  // 创建新的请求，保留所有 headers（包括 Access 头）
  const workerRequest = new Request(workerRequestUrl, {
    method: request.method,
    headers: request.headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.clone().arrayBuffer() : undefined,
  });
  
  try {
    const response = await fetch(workerRequest);
    
    // 创建新的响应，保留所有 headers
    const responseBody = await response.arrayBuffer();
    
    return new Response(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to reach Worker: ' + error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
