/**
 * Cloudflare Worker for Schedule Admin API
 *
 * Handles authentication via Cloudflare Access and provides
 * admin endpoints for schedule management.
 *
 * STATUS: the /api/ideas/* endpoints are live and serve the ideas board in the
 * extension popup and on the ideas site. Everything else here is not.
 *
 * The schedule admin path (and the `admin/` panel in front of it) has never been
 * used in production: the source of truth for special days is the git-tracked
 * file `hilltoppers-pages/data/special_days.json`, hand-edited and served as a
 * static asset from Cloudflare Pages (hilltoppers.pages.dev/special_days.json).
 * Both the iOS app (ScheduleConfig.specialDaysURL) and the Chrome extension
 * (scheduleService.CLOUDFLARE_BASE_URL) fetch that Pages URL, NOT this Worker.
 *
 * Consequence: publishing through the admin panel writes KV `special_days` and
 * has no effect on any client. Do not build on that path without first
 * repointing the clients.
 */

import { handleCreateIdea, handleGetIdeas, handleVote } from './ideas';
import { handleHealth } from './health';
import { json as ideasJson, preflight } from './http';

const IDEAS_VOTE_PATH = /^\/api\/ideas\/\d+\/vote$/;
const IDEAS_HEALTH_PATH = '/api/ideas/health';

export interface Env {
  // Role allowlists (comma-separated emails)
  EDITORS: string;
  ADMINS: string;
  
  // Cloudflare Access JWT verification (optional, for future use)
  CLOUDFLARE_ACCESS_AUD: string;
  
  // KV namespace for storing schedule data
  SCHEDULE_KV: KVNamespace;

  // Ideas board
  GITHUB_TOKEN: string;
  GITHUB_REPO: string;
  FIREBASE_PROJECT_ID: string;
  IDEAS_DB: D1Database;
}

interface User {
  email: string;
  role: 'editor' | 'admin';
}

interface AuthResult {
  user: User | null;
  error: string | null;
}

/**
 * Extract user email from Cloudflare Access headers
 */
function extractUserEmail(request: Request, env: Env): string | null {
  // Cloudflare Access injects the authenticated email in this header
  const email = request.headers.get('Cf-Access-Authenticated-User-Email');
  if (email) {
    return email.toLowerCase().trim();
  }
  
  // Fallback: try to extract from JWT (if available)
  const jwtHeader = request.headers.get('Cf-Access-Jwt-Assertion');
  if (jwtHeader) {
    try {
      // Basic JWT parsing (just the payload)
      const parts = jwtHeader.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        if (payload.email) {
          return payload.email.toLowerCase().trim();
        }
      }
    } catch (e) {
      // JWT parsing failed, continue with header-based approach
    }
  }
  
  // 本地开发模式：如果没有 Access 头，使用环境变量中的第一个 admin 邮箱作为测试用户
  // 检测方法：检查 Origin/Referer 是否包含 localhost，或者检查环境变量中是否有开发模式标记
  const origin = request.headers.get('Origin') || '';
  const referer = request.headers.get('Referer') || '';
  const host = request.headers.get('Host') || '';
  const isLocalDev = origin.includes('localhost') || origin.includes('127.0.0.1') || 
                     referer.includes('localhost') || referer.includes('127.0.0.1') ||
                     host.includes('localhost') || host.includes('127.0.0.1');
  
  if (isLocalDev && env.ADMINS) {
    // 使用第一个 admin 邮箱作为测试用户
    const admins = env.ADMINS.split(',').map(e => e.toLowerCase().trim()).filter(Boolean);
    if (admins.length > 0) {
      console.log(`[Local Dev] Using test user: ${admins[0]}`);
      return admins[0];
    }
  }
  
  return null;
}

/**
 * Determine user role from email allowlists
 */
function determineRole(email: string, env: Env): 'editor' | 'admin' | null {
  const editors = env.EDITORS?.split(',').map(e => e.toLowerCase().trim()).filter(Boolean) || [];
  const admins = env.ADMINS?.split(',').map(e => e.toLowerCase().trim()).filter(Boolean) || [];
  
  if (admins.includes(email)) {
    return 'admin';
  }
  if (editors.includes(email)) {
    return 'editor';
  }
  
  return null;
}

/**
 * Authenticate request and extract user info
 */
function authenticate(request: Request, env: Env): AuthResult {
  const email = extractUserEmail(request, env);
  
  if (!email) {
    return {
      user: null,
      error: 'No authenticated user found. Ensure Cloudflare Access is configured.'
    };
  }
  
  const role = determineRole(email, env);
  if (!role) {
    return {
      user: null,
      error: 'User not authorized. Contact administrator to be added to allowlist.'
    };
  }
  
  return {
    user: { email, role },
    error: null
  };
}

/**
 * Check if user has required role
 */
function hasRole(user: User, required: 'editor' | 'admin'): boolean {
  if (required === 'admin') {
    return user.role === 'admin';
  }
  // editor role can access editor endpoints
  return user.role === 'editor' || user.role === 'admin';
}

/**
 * JSON response helper
 */
function jsonResponse(data: any, status = 200, request?: Request): Response {
  // 允许从 Pages 域名来的请求
  const origin = request?.headers.get('Origin');
  const allowedOrigins = [
    'https://schedule-admin-ui.pages.dev',
    'http://localhost:3000', // 开发环境
  ];
  
  const allowOrigin = origin && allowedOrigins.includes(origin) ? origin : '*';
  
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cf-Access-Authenticated-User-Email, Cf-Access-Jwt-Assertion',
      'Access-Control-Allow-Credentials': 'true',
    },
  });
}

/**
 * Error response helper
 */
function errorResponse(message: string, status = 400, request?: Request): Response {
  return jsonResponse({ error: message }, status, request);
}

/**
 * Handle CORS preflight
 */
function handleCORS(request: Request): Response {
  const origin = request.headers.get('Origin');
  const allowedOrigins = [
    'https://schedule-admin-ui.pages.dev',
    'http://localhost:3000', // 开发环境
  ];
  
  const allowOrigin = origin && allowedOrigins.includes(origin) ? origin : '*';
  
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cf-Access-Authenticated-User-Email, Cf-Access-Jwt-Assertion',
      'Access-Control-Allow-Credentials': 'true',
    },
  });
}

/**
 * Get current user info
 */
async function handleGetUser(request: Request, env: Env): Promise<Response> {
  const auth = authenticate(request, env);
  if (auth.error || !auth.user) {
    return errorResponse(auth.error || 'Unauthorized', 403, request);
  }
  
  return jsonResponse({
    email: auth.user.email,
    role: auth.user.role
  }, 200, request);
}

/**
 * Get schedule drafts (editor+)
 */
async function handleGetDrafts(request: Request, env: Env): Promise<Response> {
  const auth = authenticate(request, env);
  if (auth.error || !auth.user) {
    return errorResponse(auth.error || 'Unauthorized', 403, request);
  }
  
  if (!hasRole(auth.user, 'editor')) {
    return errorResponse('Insufficient permissions', 403, request);
  }
  
  try {
    const drafts = await env.SCHEDULE_KV.list({ prefix: 'draft:' });
    const draftData: Record<string, any> = {};
    
    for (const key of drafts.keys) {
      const value = await env.SCHEDULE_KV.get(key.name);
      if (value) {
        const dateKey = key.name.replace('draft:', '');
        draftData[dateKey] = JSON.parse(value);
      }
    }
    
    return jsonResponse({ drafts: draftData }, 200, request);
  } catch (error) {
    return errorResponse('Failed to fetch drafts', 500, request);
  }
}

/**
 * Save schedule draft (editor+)
 */
async function handleSaveDraft(request: Request, env: Env): Promise<Response> {
  const auth = authenticate(request, env);
  if (auth.error || !auth.user) {
    return errorResponse(auth.error || 'Unauthorized', 403, request);
  }
  
  if (!hasRole(auth.user, 'editor')) {
    return errorResponse('Insufficient permissions', 403, request);
  }
  
  try {
    const body = await request.json();
    const { dateKey, data } = body;
    
    if (!dateKey || !data) {
      return errorResponse('Missing dateKey or data', 400, request);
    }
    
    // Validate date format (yyyy-MM-dd)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      return errorResponse('Invalid date format. Use yyyy-MM-dd', 400, request);
    }
    
    // Store draft (包装成 { data: {...}, updatedBy, updatedAt } 格式)
    await env.SCHEDULE_KV.put(`draft:${dateKey}`, JSON.stringify({
      data: data,  // 将 data 包装在 data 字段中
      updatedBy: auth.user.email,
      updatedAt: new Date().toISOString()
    }));
    
    return jsonResponse({ success: true, dateKey }, 200, request);
  } catch (error) {
    return errorResponse('Failed to save draft', 500, request);
  }
}

/**
 * Delete schedule draft (editor+)
 */
async function handleDeleteDraft(request: Request, env: Env, dateKey: string): Promise<Response> {
  const auth = authenticate(request, env);
  if (auth.error || !auth.user) {
    return errorResponse(auth.error || 'Unauthorized', 403, request);
  }
  
  if (!hasRole(auth.user, 'editor')) {
    return errorResponse('Insufficient permissions', 403, request);
  }
  
  try {
    await env.SCHEDULE_KV.delete(`draft:${dateKey}`);
    return jsonResponse({ success: true }, 200, request);
  } catch (error) {
    return errorResponse('Failed to delete draft', 500, request);
  }
}

/**
 * Publish schedule (admin only)
 */
async function handlePublish(request: Request, env: Env): Promise<Response> {
  const auth = authenticate(request, env);
  if (auth.error || !auth.user) {
    return errorResponse(auth.error || 'Unauthorized', 403, request);
  }
  
  if (!hasRole(auth.user, 'admin')) {
    return errorResponse('Admin role required for publishing', 403, request);
  }
  
  try {
    const body = await request.json();
    const { dateKey } = body;
    
    if (!dateKey) {
      return errorResponse('Missing dateKey', 400, request);
    }
    
    // Get draft
    const draft = await env.SCHEDULE_KV.get(`draft:${dateKey}`);
    if (!draft) {
      return errorResponse('Draft not found', 404, request);
    }
    
    // Publish to production key
    await env.SCHEDULE_KV.put(`published:${dateKey}`, draft);
    
    // Also update special_days aggregate (simplified - in production, you'd want to merge)
    const specialDays = await env.SCHEDULE_KV.get('special_days') || '{}';
    const days = JSON.parse(specialDays);
    days[dateKey] = JSON.parse(draft);
    await env.SCHEDULE_KV.put('special_days', JSON.stringify(days));
    
    // NOTE: the KV aggregate written above is a dead end — clients read
    // special_days.json from Pages (git), so publishing here reaches nobody.
    
    return jsonResponse({ success: true, dateKey }, 200, request);
  } catch (error) {
    return errorResponse('Failed to publish', 500, request);
  }
}

/**
 * Get published schedules (editor+)
 */
async function handleGetPublished(request: Request, env: Env): Promise<Response> {
  const auth = authenticate(request, env);
  if (auth.error || !auth.user) {
    return errorResponse(auth.error || 'Unauthorized', 403, request);
  }
  
  if (!hasRole(auth.user, 'editor')) {
    return errorResponse('Insufficient permissions', 403, request);
  }
  
  try {
    const published = await env.SCHEDULE_KV.list({ prefix: 'published:' });
    const scheduleData: Record<string, any> = {};
    
    for (const key of published.keys) {
      const value = await env.SCHEDULE_KV.get(key.name);
      if (value) {
        const dateKey = key.name.replace('published:', '');
        scheduleData[dateKey] = JSON.parse(value);
      }
    }
    
    return jsonResponse({ schedules: scheduleData }, 200, request);
  } catch (error) {
    return errorResponse('Failed to fetch published schedules', 500, request);
  }
}

/**
 * Rollback published schedule (admin only)
 */
async function handleRollback(request: Request, env: Env): Promise<Response> {
  const auth = authenticate(request, env);
  if (auth.error || !auth.user) {
    return errorResponse(auth.error || 'Unauthorized', 403, request);
  }
  
  if (!hasRole(auth.user, 'admin')) {
    return errorResponse('Admin role required for rollback', 403, request);
  }
  
  try {
    const body = await request.json();
    const { dateKey } = body;
    
    if (!dateKey) {
      return errorResponse('Missing dateKey', 400, request);
    }
    
    // Delete published version
    await env.SCHEDULE_KV.delete(`published:${dateKey}`);
    
    // Remove from special_days aggregate
    const specialDays = await env.SCHEDULE_KV.get('special_days') || '{}';
    const days = JSON.parse(specialDays);
    delete days[dateKey];
    await env.SCHEDULE_KV.put('special_days', JSON.stringify(days));
    
    return jsonResponse({ success: true, dateKey }, 200, request);
  } catch (error) {
    return errorResponse('Failed to rollback', 500, request);
  }
}

/**
 * Main request handler
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Ideas board. Public, and with its own CORS policy because it is called
    // from the extension and the ideas site rather than the admin UI.
    if (path === '/api/ideas' || path === IDEAS_HEALTH_PATH || IDEAS_VOTE_PATH.test(path)) {
      if (request.method === 'OPTIONS') {
        return preflight(request);
      }
      if (path === IDEAS_HEALTH_PATH) {
        if (request.method === 'GET') {
          return handleHealth(request, env);
        }
      } else if (path === '/api/ideas') {
        if (request.method === 'GET') {
          return handleGetIdeas(request, env);
        }
        if (request.method === 'POST') {
          return handleCreateIdea(request, env);
        }
      } else {
        const issueNumber = Number(path.split('/')[3]);
        if (request.method === 'POST') {
          return handleVote(request, env, issueNumber, true);
        }
        if (request.method === 'DELETE') {
          return handleVote(request, env, issueNumber, false);
        }
      }
      return ideasJson({ error: 'Method not allowed' }, 405, request);
    }

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCORS(request);
    }
    
    // Public endpoints (no auth required)
    if (path === '/api/special_days.json' && request.method === 'GET') {
      try {
        const data = await env.SCHEDULE_KV.get('special_days');
        if (!data) {
          // If special_days not found, return empty object
          return new Response('{}', {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'public, max-age=300',
            },
          });
        }
        return new Response(data, {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
          },
        });
      } catch (error) {
        console.error('Error fetching special_days:', error);
        return errorResponse(`Failed to fetch schedule: ${error instanceof Error ? error.message : String(error)}`, 500, request);
      }
    }
    
    // Public endpoint for special_periods (read from KV or return empty array)
    if (path === '/api/special_periods.json' && request.method === 'GET') {
      try {
        const data = await env.SCHEDULE_KV.get('special_periods');
        if (!data) {
          // If special_periods not found, return empty array
          return new Response('[]', {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'public, max-age=300',
            },
          });
        }
        return new Response(data, {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=300',
          },
        });
      } catch (error) {
        console.error('Error fetching special_periods:', error);
        return errorResponse(`Failed to fetch special periods: ${error instanceof Error ? error.message : String(error)}`, 500, request);
      }
    }
    
    // Protected admin endpoints
    if (path.startsWith('/api/admin/')) {
      const adminPath = path.replace('/api/admin/', '');
      
      if (adminPath === 'user' && request.method === 'GET') {
        return handleGetUser(request, env);
      }
      
      if (adminPath === 'drafts' && request.method === 'GET') {
        return handleGetDrafts(request, env);
      }
      
      if (adminPath === 'published' && request.method === 'GET') {
        return handleGetPublished(request, env);
      }
      
      if (adminPath === 'drafts' && request.method === 'POST') {
        return handleSaveDraft(request, env);
      }
      
      if (adminPath.startsWith('drafts/') && request.method === 'DELETE') {
        const dateKey = adminPath.replace('drafts/', '');
        return handleDeleteDraft(request, env, dateKey);
      }
      
      if (adminPath === 'publish' && request.method === 'POST') {
        return handlePublish(request, env);
      }
      
      if (adminPath === 'rollback' && request.method === 'POST') {
        return handleRollback(request, env);
      }
      
      return errorResponse('Not found', 404, request);
    }
    
    // Admin UI routes (served by Pages, but we can handle 404 here)
    if (path.startsWith('/admin/')) {
      // This would be handled by Cloudflare Pages for the UI
      // The worker only handles API routes
      return errorResponse('Admin UI not found. Ensure Pages is configured.', 404, request);
    }
    
    return errorResponse('Not found', 404, request);
  },
};

