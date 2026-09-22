export interface ToppingsEnv {
  TOPPINGS_DB: D1Database;
  SCHOOL_EMAIL_DB?: D1Database;
  FIREBASE_PROJECT_ID: string;
  TOPPING_EMAIL_DOMAINS: string;
}
import { verifyFirebaseToken } from './firebaseAuth';
import { json } from './http';

// URLs are loaded only by the user's browser, never fetched by this API.
export function publicHTTPS(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      !url.hostname.includes(':') && !/^\d+\./.test(url.hostname) &&
      url.hostname.includes('.') && !/\.(localhost|local|internal)$/.test(url.hostname);
  } catch { return false; }
}

async function readBody(request: Request): Promise<any> {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  let text = ''; let bytes = 0; const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > 12000) { await reader.cancel(); return null; }
    text += decoder.decode(value, { stream: true });
  }
  try { return JSON.parse(text + decoder.decode()); } catch { return null; }
}

export async function handleToppings(request: Request, env: ToppingsEnv): Promise<Response> {
  const path = new URL(request.url).pathname;
  const respond = (data: unknown, status = 200) => json(data, status, request);
  const device = request.headers.get('X-Topping-Install-ID');
  if (device && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(device)) return respond({ error: 'Invalid installation identifier.' }, 400);
  const user = await verifyFirebaseToken(request, env.FIREBASE_PROJECT_ID);
  const installation = device ? `browser:${device}` : user?.uid || '';
  const installPath = /^\/api\/toppings\/([a-zA-Z0-9-]{1,64})\/install$/.exec(path);
  if (installPath && ['POST', 'DELETE'].includes(request.method)) {
    if (!device && (!user || !user.emailVerified)) return respond({ error: 'An installation identifier is required.' }, 400);
    const id = installPath[1];
    if (request.method === 'POST') {
      const available = await env.TOPPINGS_DB.prepare('SELECT 1 FROM toppings WHERE id=? AND hidden=0').bind(id).first();
      if (!available) return respond({ error: 'This Topping is no longer available.' }, 404);
      const operations = [env.TOPPINGS_DB.prepare('INSERT OR IGNORE INTO topping_users(topping_id,uid) VALUES (?,?)').bind(id, installation)];
      // Replace this account's legacy registration when its browser upgrades.
      if (device && user?.emailVerified) operations.push(env.TOPPINGS_DB.prepare('DELETE FROM topping_users WHERE topping_id=? AND uid=?').bind(id, user.uid));
      await env.TOPPINGS_DB.batch(operations);
    } else {
      const operations = [env.TOPPINGS_DB.prepare('DELETE FROM topping_users WHERE topping_id=? AND uid=?').bind(id, installation)];
      if (device && user?.emailVerified) operations.push(env.TOPPINGS_DB.prepare('DELETE FROM topping_users WHERE topping_id=? AND uid=?').bind(id, user.uid));
      await env.TOPPINGS_DB.batch(operations);
    }
    return respond({ ok: true });
  }
  if (path === '/api/toppings' && request.method === 'GET') {
    const rows = await env.TOPPINGS_DB.prepare(`SELECT t.id, t.name, t.description, t.url, t.image, t.icon,
      t.author, t.graduation_year AS graduationYear, t.created_at AS createdAt,
      (SELECT COUNT(*) FROM topping_users u WHERE u.topping_id=t.id) AS users,
      (SELECT AVG(stars) FROM topping_ratings r WHERE r.topping_id=t.id) AS rating,
      (SELECT COUNT(*) FROM topping_ratings r WHERE r.topping_id=t.id) AS ratingCount,
      EXISTS(SELECT 1 FROM topping_users u WHERE u.topping_id=t.id AND u.uid=?) AS installed,
      (SELECT stars FROM topping_ratings r WHERE r.topping_id=t.id AND r.uid=?) AS myRating,
      t.author_uid=? AS owned
      FROM toppings t WHERE hidden=0 ORDER BY users DESC, created_at DESC, id`).bind(installation, user?.uid || '', user?.uid || '').all();
    return respond({ toppings: rows.results });
  }
  if (!user) return respond({ error: 'Sign in to continue.' }, 401);
  const publishing = path === '/api/toppings' && request.method === 'POST';
  if (!publishing && !user.emailVerified) return respond({ error: 'Verify your email before continuing.' }, 403);
  if (path === '/api/toppings' && request.method === 'POST') {
    const domains = (env.TOPPING_EMAIL_DOMAINS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (!domains.length) return respond({ error: 'Publishing is not configured yet.' }, 503);
    let author = user.fullName;
    if (!user.emailVerified || !domains.includes(user.email.split('@')[1])) {
      const linked = await env.SCHOOL_EMAIL_DB?.prepare('SELECT email FROM school_links WHERE uid=?').bind(user.uid).first<{email:string}>();
      if (!linked || !domains.includes(linked.email.split('@')[1])) return respond({ error: 'Link and verify your school email to publish.' }, 403);
      author = linked.email.split('@')[0].split(/[._-]+/).filter(Boolean).map(part=>part[0].toUpperCase()+part.slice(1)).join(' ');
    }
    if (!author || /^anonymous$/i.test(author)) return respond({ error: 'Set your real name in your account before publishing.' }, 400);
    const body = await readBody(request);
    if (!body || typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.length > 48 ||
      typeof body.description !== 'string' || body.description.trim().length < 10 || body.description.length > 180 ||
      !publicHTTPS(body.url) || !publicHTTPS(body.image) ||
      (body.graduationYear != null && (!Number.isInteger(body.graduationYear) || body.graduationYear < 1950 || body.graduationYear > 2100))) {
      return respond({ error: 'Enter a name, a short description, and valid HTTPS page and preview-image URLs.' }, 400);
    }
    const icon = body.icon ?? 'sparkle';
    if (!['sparkle','chat','book','calendar','clock','checklist','music','trophy','lightbulb','heart','bell','people'].includes(icon)) return respond({error:'Choose a valid icon.'},400);
    const id = crypto.randomUUID();
    const result = await env.TOPPINGS_DB.prepare(`INSERT INTO toppings
      (id,name,description,url,image,author_uid,author,graduation_year,created_at,icon)
      SELECT ?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM toppings WHERE author_uid=? AND hidden=0)<20`)
      .bind(id, body.name.trim(), body.description.trim(), body.url, body.image, user.uid, author, body.graduationYear ?? null, Date.now(), icon, user.uid).run();
    if (!result.meta.changes) return respond({ error: 'You can have up to 20 published Toppings.' }, 429);
    return respond({ id }, 201);
  }
  const match = /^\/api\/toppings\/([a-zA-Z0-9-]{1,64})(?:\/(install|rating|report))?$/.exec(path);
  if (!match) return respond({ error: 'Not found.' }, 404);
  const [, id, action] = match;
  const topping = await env.TOPPINGS_DB.prepare('SELECT author_uid FROM toppings WHERE id=? AND hidden=0').bind(id).first<{author_uid: string}>();
  if (!topping) return respond({ error: 'This Topping is no longer available.' }, 404);
  if (!action && request.method === 'DELETE') {
    if (topping.author_uid !== user.uid) return respond({ error: 'Only the author can unpublish this Topping.' }, 403);
    await env.TOPPINGS_DB.prepare('UPDATE toppings SET hidden=1 WHERE id=?').bind(id).run();
  } else if (action === 'rating' && request.method === 'POST') {
    const body = await readBody(request);
    if (!body || !Number.isInteger(body.stars) || body.stars < 1 || body.stars > 5) return respond({ error: 'Choose 1–5 stars.' }, 400);
    const installed = await env.TOPPINGS_DB.prepare('SELECT 1 FROM topping_users WHERE topping_id=? AND uid=?').bind(id,installation).first();
    if (!installed) return respond({ error: 'Add this Topping before rating it.' }, 403);
    await env.TOPPINGS_DB.prepare('INSERT INTO topping_ratings VALUES (?,?,?) ON CONFLICT(topping_id,uid) DO UPDATE SET stars=excluded.stars').bind(id,user.uid,body.stars).run();
  } else if (action === 'report' && request.method === 'POST') {
    const body = await readBody(request);
    if (!body || typeof body.reason !== 'string' || body.reason.trim().length < 5 || body.reason.length > 1000) return respond({ error: 'Describe the issue in 5–1000 characters.' }, 400);
    await env.TOPPINGS_DB.prepare('INSERT INTO topping_reports VALUES (?,?,?,?) ON CONFLICT(topping_id,uid) DO UPDATE SET reason=excluded.reason,created_at=excluded.created_at').bind(id,user.uid,body.reason.trim(),Date.now()).run();
  } else return respond({ error: 'Method not allowed.' }, 405);
  return respond({ ok: true });
}
