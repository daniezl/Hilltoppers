export interface ToppingsEnv {
  TOPPINGS_DB: D1Database;
  SCHOOL_EMAIL_DB?: D1Database;
  FIREBASE_PROJECT_ID: string;
  TOPPING_EMAIL_DOMAINS: string;
  TOPPING_REVIEWER_EMAIL?: string;
}
import { verifyFirebaseToken } from './firebaseAuth';
import { json } from './http';

const iconIds = ['sparkle','chat','book','calendar','clock','checklist','music','trophy','lightbulb','heart','bell','people'];
function uploadedImage(value: unknown): {mime:string;data:string} | null {
  if (typeof value !== 'string') return null;
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length > 700000) return null;
  try {
    const bytes=atob(match[2]);
    const valid=match[1]==='image/png' ? bytes.startsWith('\x89PNG\r\n\x1a\n') : match[1]==='image/jpeg' ? bytes.startsWith('\xff\xd8\xff') : bytes.startsWith('RIFF') && bytes.slice(8,12)==='WEBP';
    return valid ? {mime:match[1],data:match[2]} : null;
  } catch { return null; }
}


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

async function readBody(request: Request, limit = 12000): Promise<any> {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  let text = ''; let bytes = 0; const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > limit) { await reader.cancel(); return null; }
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
  const canReview = Boolean(user?.emailVerified && env.TOPPING_REVIEWER_EMAIL && user.email.toLowerCase() === env.TOPPING_REVIEWER_EMAIL.toLowerCase());
  const imagePath = /^\/api\/toppings\/([a-zA-Z0-9-]{1,64})\/image$/.exec(path);
  if (imagePath && request.method === 'GET') {
    const image = await env.TOPPINGS_DB.prepare('SELECT i.mime,i.data FROM topping_images i JOIN toppings t ON t.id=i.topping_id WHERE t.id=? AND t.hidden=0').bind(imagePath[1]).first<{mime:string;data:string}>();
    if (!image) return respond({error:'Image not found.'},404);
    return new Response(Uint8Array.from(atob(image.data), c=>c.charCodeAt(0)), {headers:{'Content-Type':image.mime,'X-Content-Type-Options':'nosniff','Cache-Control':'public, max-age=300'}});
  }
  if (path === '/api/toppings/submissions' && request.method === 'GET') {
    if (!user) return respond({error:'Sign in to continue.'},401);
    if (new URL(request.url).searchParams.get('own') === '1') {
      const rows=await env.TOPPINGS_DB.prepare('SELECT id,name,description,image,url,icon,status,hidden FROM toppings WHERE author_uid=? ORDER BY created_at DESC').bind(user.uid).all();
      const drafts=await env.TOPPINGS_DB.prepare('SELECT r.topping_id,r.payload,r.status FROM topping_revisions r JOIN toppings t ON t.id=r.topping_id WHERE t.author_uid=? AND r.status!="approved"').bind(user.uid).all<{topping_id:string;payload:string;status:string}>();
      const toppings=rows.results.map((t:any)=>{const draft=drafts.results.find(r=>r.topping_id===t.id);return draft?{...t,...JSON.parse(draft.payload),revisionStatus:draft.status}:t;});
      return respond({toppings});
    }
    const rows=await env.TOPPINGS_DB.prepare(`SELECT id,name,description,url,image,icon,author,status,created_at AS createdAt FROM toppings WHERE hidden=0 AND (author_uid=? OR (?=1 AND status='pending')) ORDER BY created_at DESC LIMIT 100`).bind(user.uid,canReview?1:0).all();
    const drafts=await env.TOPPINGS_DB.prepare("SELECT t.id,t.author,r.payload FROM topping_revisions r JOIN toppings t ON t.id=r.topping_id WHERE r.status='pending' AND t.hidden=0 AND (t.author_uid=? OR ?=1)").bind(user.uid,canReview?1:0).all<{id:string;author:string;payload:string}>();
    return respond({canReview,toppings:[...rows.results.filter((t:any)=>!drafts.results.some(r=>r.id===t.id)),...drafts.results.map(r=>({id:r.id,author:r.author,...JSON.parse(r.payload),status:'pending'}))]});
  }
  const reviewPath=/^\/api\/toppings\/([a-zA-Z0-9-]{1,64})\/review$/.exec(path);
  if (reviewPath && request.method==='POST') {
    if (!canReview) return respond({error:'Only the reviewer can approve Toppings.'},403);
    const body=await readBody(request);
    if (!['approved','rejected'].includes(body?.status)) return respond({error:'Choose approve or reject.'},400);
    const revision=await env.TOPPINGS_DB.prepare("SELECT payload FROM topping_revisions WHERE topping_id=? AND status='pending'").bind(reviewPath[1]).first<{payload:string}>();
    if(revision){
      const draft=JSON.parse(revision.payload);
      const exists=await env.TOPPINGS_DB.prepare('SELECT id FROM toppings WHERE id=? AND hidden=0').bind(reviewPath[1]).first();
      if(!exists)return respond({error:'This Topping has been withdrawn.'},409);
      const operations=[];
      if(body.status==='approved') {
        const upload=uploadedImage(draft.imageData);
        const image=upload?`${new URL(request.url).origin}/api/toppings/${reviewPath[1]}/image?v=${Date.now()}`:draft.image;
        operations.push(env.TOPPINGS_DB.prepare("UPDATE toppings SET name=?,description=?,url=?,icon=?,image=?,status='approved' WHERE id=? AND hidden=0 AND EXISTS(SELECT 1 FROM topping_revisions WHERE topping_id=? AND payload=? AND status='pending')").bind(draft.name,draft.description,draft.url,draft.icon,image,reviewPath[1],reviewPath[1],revision.payload));
        if(upload)operations.push(env.TOPPINGS_DB.prepare("INSERT INTO topping_images(topping_id,mime,data) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM topping_revisions WHERE topping_id=? AND payload=? AND status='pending') ON CONFLICT(topping_id) DO UPDATE SET mime=excluded.mime,data=excluded.data").bind(reviewPath[1],upload.mime,upload.data,reviewPath[1],revision.payload));
      }
      operations.push(env.TOPPINGS_DB.prepare("UPDATE topping_revisions SET status=? WHERE topping_id=? AND payload=? AND status='pending'").bind(body.status,reviewPath[1],revision.payload));
      const results=await env.TOPPINGS_DB.batch(operations);
      return results[results.length-1].meta.changes?respond({ok:true}):respond({error:'This submission changed. Refresh and try again.'},409);
    }
    const result=await env.TOPPINGS_DB.prepare("UPDATE toppings SET status=? WHERE id=? AND hidden=0 AND status='pending'").bind(body.status,reviewPath[1]).run();
    return result.meta.changes ? respond({ok:true}) : respond({error:'This submission has already been reviewed or withdrawn.'},409);
  }

  const installPath = /^\/api\/toppings\/([a-zA-Z0-9-]{1,64})\/install$/.exec(path);
  if (installPath && ['POST', 'DELETE'].includes(request.method)) {
    if (!device && (!user || !user.emailVerified)) return respond({ error: 'An installation identifier is required.' }, 400);
    const id = installPath[1];
    if (request.method === 'POST') {
      const available = await env.TOPPINGS_DB.prepare("SELECT 1 FROM toppings WHERE id=? AND hidden=0 AND status='approved'").bind(id).first();
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
      FROM toppings t WHERE hidden=0 AND status='approved' ORDER BY users DESC, created_at DESC, id`).bind(installation, user?.uid || '', user?.uid || '').all();
    return respond({ toppings: rows.results });
  }
  if (!user) return respond({ error: 'Sign in to continue.' }, 401);
  const publishing = path === '/api/toppings' && request.method === 'POST';
  if (!publishing && request.method !== 'DELETE' && !user.emailVerified) return respond({ error: 'Verify your email before continuing.' }, 403);
  if (path === '/api/toppings' && request.method === 'POST') {
    const domains = (env.TOPPING_EMAIL_DOMAINS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (!domains.length) return respond({ error: 'Publishing is not configured yet.' }, 503);
    let schoolEmail = user.email;
    if (!user.emailVerified || !domains.includes(user.email.split('@')[1])) {
      const linked = await env.SCHOOL_EMAIL_DB?.prepare('SELECT email FROM school_links WHERE uid=?').bind(user.uid).first<{email:string}>();
      if (!linked || !domains.includes(linked.email.split('@')[1])) return respond({ error: 'Link and verify your school email to publish.' }, 403);
      schoolEmail = linked.email;
    }
    const author = schoolEmail.split('@')[0].split(/[._-]+/).filter(Boolean).map(part=>part[0].toUpperCase()+part.slice(1)).join(' ');
    const body = await readBody(request, 720000);
    const upload = uploadedImage(body?.imageData);
    const description=body?.description??'';
    if (!body || typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.length > 48 ||
      typeof description !== 'string' || description.length > 180 ||
      !publicHTTPS(body.url) || (body.imageData != null ? !upload : !publicHTTPS(body.image)) ||
      (body.graduationYear != null && (!Number.isInteger(body.graduationYear) || body.graduationYear < 1950 || body.graduationYear > 2100))) {
      return respond({ error: 'Enter a name, an HTTPS page URL, and a valid preview image.' }, 400);
    }
    const icon = body.icon;
    if (!iconIds.includes(icon)) return respond({error:'Choose a valid icon.'},400);
    const id = crypto.randomUUID();
    const imageURL=upload ? `${new URL(request.url).origin}/api/toppings/${id}/image` : body.image;
    const insert=env.TOPPINGS_DB.prepare(`INSERT INTO toppings
      (id,name,description,url,image,author_uid,author,graduation_year,created_at,icon,status)
      SELECT ?,?,?,?,?,?,?,?,?,?,'pending' WHERE (SELECT COUNT(*) FROM toppings WHERE author_uid=? AND hidden=0)<20`)
      .bind(id, body.name.trim(), description.trim(), body.url, imageURL, user.uid, author, null, Date.now(), icon, user.uid);
    const operations=[insert];
    if(upload) operations.push(env.TOPPINGS_DB.prepare('INSERT INTO topping_images(topping_id,mime,data) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM toppings WHERE id=?)').bind(id,upload.mime,upload.data,id));
    const [result]=await env.TOPPINGS_DB.batch(operations);
    if (!result.meta.changes) return respond({ error: 'You can have up to 20 Toppings.' }, 429);
    return respond({ id, status:'pending' }, 201);
  }

  const editPath=/^\/api\/toppings\/([a-zA-Z0-9-]{1,64})\/edit$/.exec(path);
  if(editPath && request.method==='POST') {
    const current=await env.TOPPINGS_DB.prepare('SELECT author_uid,image FROM toppings WHERE id=? AND hidden=0').bind(editPath[1]).first<{author_uid:string;image:string}>();
    if(!current)return respond({error:'This Topping is no longer available.'},404);
    if(current.author_uid!==user.uid)return respond({error:'Only the author can edit this Topping.'},403);
    const body=await readBody(request,720000);
    const upload=uploadedImage(body?.imageData);
    if(!body || typeof body.name!=='string' || body.name.trim().length<2 || body.name.length>48 || typeof body.description!=='string' || body.description.length>180 || !publicHTTPS(body.url) || !iconIds.includes(body.icon) || (body.imageData!=null&&!upload))return respond({error:'Check the name, URL, icon and preview image.'},400);
    const payload=JSON.stringify({name:body.name.trim(),description:body.description.trim(),url:body.url,icon:body.icon,image:upload?body.imageData:current.image,...(upload?{imageData:body.imageData}:{})});
    await env.TOPPINGS_DB.prepare("INSERT INTO topping_revisions(topping_id,payload,status) VALUES (?,?,'pending') ON CONFLICT(topping_id) DO UPDATE SET payload=excluded.payload,status='pending'").bind(editPath[1],payload).run();
    return respond({ok:true,status:'pending'});
  }

  const match = /^\/api\/toppings\/([a-zA-Z0-9-]{1,64})(?:\/(install|rating|report))?$/.exec(path);
  if (!match) return respond({ error: 'Not found.' }, 404);
  const [, id, action] = match;
  const topping = await env.TOPPINGS_DB.prepare('SELECT author_uid,status FROM toppings WHERE id=? AND hidden=0').bind(id).first<{author_uid: string;status:string}>();
  if (!topping) return respond({ error: 'This Topping is no longer available.' }, 404);
  if (action && topping.status !== 'approved') return respond({error:'This Topping is not published.'},404);
  if (!action && request.method === 'DELETE') {
    if (topping.author_uid !== user.uid && !canReview) return respond({ error: 'Only the author or reviewer can unpublish this Topping.' }, 403);
    await env.TOPPINGS_DB.batch([
      env.TOPPINGS_DB.prepare('UPDATE toppings SET hidden=1 WHERE id=?').bind(id),
      env.TOPPINGS_DB.prepare('DELETE FROM topping_images WHERE topping_id=?').bind(id)
    ]);
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
