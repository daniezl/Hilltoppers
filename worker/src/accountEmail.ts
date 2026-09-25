import { SignJWT, importPKCS8 } from 'jose';
import { verifyFirebaseToken } from './firebaseAuth';
import { json, preflight } from './http';

export interface EmailEnv {
  EMAIL_DB: D1Database;
  RESEND_API_KEY: string;
  EMAIL_FROM: string;
  OTP_SECRET: string;
  FIREBASE_SERVICE_ACCOUNT: string;
  FIREBASE_PROJECT_ID: string;
}
type Purpose = 'reset' | 'verify';
const encoder = new TextEncoder();
class RequestError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
async function digest(env: EmailEnv, text: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.OTP_SECRET), {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(text))), x => x.toString(16).padStart(2,'0')).join('');
}
async function cipherKey(env: EmailEnv) {
  return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', encoder.encode('action-code:'+env.OTP_SECRET)), 'AES-GCM', false, ['encrypt','decrypt']);
}
async function seal(env: EmailEnv, value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM', iv}, await cipherKey(env), encoder.encode(value)));
  return btoa(String.fromCharCode(...iv,...encrypted));
}
async function unseal(env: EmailEnv, value: string) {
  const bytes = Uint8Array.from(atob(value), c => c.charCodeAt(0));
  return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12)}, await cipherKey(env), bytes.slice(12)));
}
// One atomic counter per window prevents concurrent requests bypassing limits.
async function limit(env: EmailEnv, name: string, seconds: number, maximum: number) {
  const now = Math.floor(Date.now()/1000);
  const key = await digest(env, name+':'+Math.floor(now/seconds));
  const row = await env.EMAIL_DB.prepare(`INSERT INTO email_limits (key, count, expires) VALUES (?,1,?)
    ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count`).bind(key, now+seconds).first<{count:number}>();
  if (!row || row.count > maximum) throw new RequestError('Too many attempts. Please try again later.',429);
}
let oauth: {token:string; expires:number; identity:string} | undefined;
async function googleToken(env: EmailEnv) {
  const account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT) as {client_email:string; private_key:string; project_id:string};
  if (account.project_id !== env.FIREBASE_PROJECT_ID) throw new Error('Wrong Firebase project');
  if (oauth?.identity === account.client_email && oauth.expires > Date.now()) return oauth.token;
  const assertion = await new SignJWT({scope:'https://www.googleapis.com/auth/identitytoolkit'})
    .setProtectedHeader({alg:'RS256'}).setIssuer(account.client_email)
    .setAudience('https://oauth2.googleapis.com/token').setIssuedAt().setExpirationTime('5m')
    .sign(await importPKCS8(account.private_key,'RS256'));
  const response = await fetch('https://oauth2.googleapis.com/token',{method:'POST',
    body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}), signal:AbortSignal.timeout(15000)});
  const data = await response.json() as {access_token?:string; expires_in:number};
  if (!response.ok || !data.access_token) throw new Error('Firebase authorization unavailable');
  oauth = {token:data.access_token,expires:Date.now()+Math.max(0,data.expires_in-60)*1000,identity:account.client_email};
  return oauth.token;
}
async function requireAccount(env: EmailEnv, email: string) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/accounts:lookup`, {
    method:'POST', headers:{Authorization:'Bearer '+await googleToken(env),'Content-Type':'application/json'},
    body:JSON.stringify({email:[email]}), signal:AbortSignal.timeout(15000)
  });
  const data = await response.json() as {users?:{localId?:string}[]};
  if (!response.ok) throw new Error('Firebase account lookup unavailable');
  if (data.users !== undefined && !Array.isArray(data.users)) throw new Error('Invalid account lookup response');
  if (!data.users?.length) throw new RequestError('No account found with this email.',404);
}
export async function createActionLink(env: EmailEnv, email: string, purpose: Purpose): Promise<string | null> {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/accounts:sendOobCode`,{
    method:'POST', headers:{Authorization:'Bearer '+await googleToken(env),'Content-Type':'application/json'},
    body:JSON.stringify({requestType:purpose==='reset'?'PASSWORD_RESET':'VERIFY_EMAIL', email,
      returnOobLink:true,targetProjectId:env.FIREBASE_PROJECT_ID}),signal:AbortSignal.timeout(15000)});
  const data = await response.json() as {oobLink?:string; email?:string; error?:{message?:string}};
  // A link can also disappear if the account changes after the lookup.
  if (data.error?.message === 'EMAIL_NOT_FOUND' || data.error?.message === 'USER_NOT_FOUND') return null;
  // With email enumeration protection, absent reset accounts can return 200 without a link.
  if (purpose === 'reset' && response.ok && !data.oobLink && data.email) return null;
  if (!response.ok || !data.oobLink) throw new Error('Firebase email link unavailable');
  return data.oobLink;
}
export async function sendAccountEmail(env: EmailEnv, email: string, purpose: Purpose, code: string, link: string, id: string) {
  const action = purpose === 'reset' ? 'Reset your password' : 'Verify your email';
  const url = new URL(link);
  if (url.origin !== `https://${env.FIREBASE_PROJECT_ID}.firebaseapp.com` || url.pathname !== '/__/auth/action') throw new Error('Unexpected action link');
  const escape = (s:string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
  const response = await fetch('https://api.resend.com/emails', {method:'POST',
    headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':id},
    body:JSON.stringify({from:env.EMAIL_FROM,to:[email],subject:`${action} for Hilltoppers`,
      text:`${action}\n\nYour code: ${code}\nEnter this code in the extension. It expires in 10 minutes.\n\nOr use this link: ${link}\n\nIf you did not request this email, ignore it.`,
      html:`<div style="font-family:Arial,sans-serif;color:#263e32;max-width:480px;margin:32px auto"><h2>${action}</h2><p style="font-size:32px;font-weight:bold;letter-spacing:6px">${code}</p><p>Enter this code in the extension. It expires in 10 minutes.</p><p><a href="${escape(link)}" style="display:inline-block;padding:12px 20px;background:#365d45;color:white;border-radius:8px;text-decoration:none">${action}</a></p><p style="font-size:12px;color:#66736a">If you did not request this email, ignore it.</p></div>`}),signal:AbortSignal.timeout(15000)});
  // Provider responses can contain recipient data; never log them.
  if (!response.ok) throw new Error('Email delivery unavailable');
}
function newCode() {
  let n: number;
  do { n=crypto.getRandomValues(new Uint32Array(1))[0]; } while(n>=4294000000);
  return String(n%1000000).padStart(6,'0');
}
async function readBody(request: Request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new RequestError('Invalid request.');
  const reader=request.body?.getReader(); if(!reader) throw new RequestError('Invalid request.');
  let text='',length=0; const decoder=new TextDecoder();
  while(true) { const {done,value}=await reader.read(); if(done)break; length+=value.length;
    if(length>4096){await reader.cancel();throw new RequestError('Request too large.',413);} text+=decoder.decode(value,{stream:true}); }
  try { const value=JSON.parse(text+decoder.decode()); if(!value || Array.isArray(value) || typeof value!=='object')throw 0;return value; }
  catch {throw new RequestError('Invalid request.');}
}
function schoolAddress(email: string) {
  return /^[^\s@]+@(student\.stjacademy\.org|stjacademy\.org)$/.test(email);
}
async function handleSchoolEmail(request: Request, env: EmailEnv, path: string) {
  const user=await verifyFirebaseToken(request,env.FIREBASE_PROJECT_ID);
  if(!user)throw new RequestError('Sign in to link your school email.',401);
  const linked=await env.EMAIL_DB.prepare('SELECT email FROM school_links WHERE uid=?').bind(user.uid).first<{email:string}>();
  if(path==='/api/account-email/school') {
    return json({email:schoolAddress(user.email)?user.email:linked?.email??null,
      verified:schoolAddress(user.email)?user.emailVerified:Boolean(linked)},200,request);
  }
  if(schoolAddress(user.email))throw new RequestError('Your sign-in email is already a school email.');
  if(path.endsWith('/unlink')) {
    await env.EMAIL_DB.batch([
      env.EMAIL_DB.prepare('DELETE FROM school_codes WHERE uid=?').bind(user.uid),
      env.EMAIL_DB.prepare('DELETE FROM school_links WHERE uid=?').bind(user.uid)
    ]);
    return json({email:null,verified:false},200,request);
  }
  if(linked)throw new RequestError('A school email is already linked.',409);
  const body=await readBody(request),now=Math.floor(Date.now()/1000);
  await limit(env,'ip:'+ (request.headers.get('CF-Connecting-IP')||'local'),3600,40);
  if(path.endsWith('/send')) {
    const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
    if(email.length>254 || !schoolAddress(email))throw new RequestError('Use your @student.stjacademy.org or @stjacademy.org email.');
    await limit(env,'school-uid:'+user.uid,3600,5);
    await limit(env,'email-minute:'+email,60,1);
    await limit(env,'email-hour:'+email,3600,5);
    await limit(env,'global',3600,100);
    const id=crypto.randomUUID(),code=newCode();
    await env.EMAIL_DB.batch([
      env.EMAIL_DB.prepare('DELETE FROM school_codes WHERE uid=?').bind(user.uid),
      env.EMAIL_DB.prepare('INSERT INTO school_codes (id,uid,email_hash,email_sealed,code_hash,expires) VALUES (?,?,?,?,?,?)')
        .bind(id,user.uid,await digest(env,'email:'+email),await seal(env,email),await digest(env,id+':'+code),now+600)
    ]);
    try {
      const response=await fetch('https://api.resend.com/emails',{method:'POST',
        headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':id},
        body:JSON.stringify({from:env.EMAIL_FROM,to:[email],subject:'Link your school email to Hilltoppers',
          text:`Your code: ${code}\n\nEnter this code in Hilltoppers to link your school email. It expires in 10 minutes.\n\nIf you did not request this, ignore this email.`}),signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error('Email delivery unavailable');
    } catch(e) {await env.EMAIL_DB.prepare('DELETE FROM school_codes WHERE id=?').bind(id).run();throw e;}
    return json({challengeId:id},200,request);
  }
  if(typeof body.challengeId!=='string' || !/^[0-9a-f-]{36}$/.test(body.challengeId) || typeof body.code!=='string' || !/^\d{6}$/.test(body.code))throw new RequestError('Enter the six-digit code.');
  const attempt=await env.EMAIL_DB.prepare('UPDATE school_codes SET attempts=attempts+1 WHERE id=? AND uid=? AND expires>? AND attempts<5 RETURNING email_sealed,code_hash')
    .bind(body.challengeId,user.uid,now).first<{email_sealed:string;code_hash:string}>();
  if(!attempt)throw new RequestError('Code expired or unavailable. Request a new one.');
  const hash=await digest(env,body.challengeId+':'+body.code);
  if(hash!==attempt.code_hash)throw new RequestError('Incorrect code. Try again.');
  const email=await unseal(env,attempt.email_sealed);
  // Insert and consume together; unique constraints prevent competing account bindings.
  const result=await env.EMAIL_DB.batch([
    env.EMAIL_DB.prepare(`INSERT OR IGNORE INTO school_links (uid,email,linked_at)
      SELECT uid,?,? FROM school_codes WHERE id=? AND uid=? AND code_hash=? AND attempts<=5 AND expires>?`)
      .bind(email,now,body.challengeId,user.uid,hash,now),
    env.EMAIL_DB.prepare('DELETE FROM school_codes WHERE id=? AND uid=? AND code_hash=?').bind(body.challengeId,user.uid,hash)
  ]);
  if(!result[0].meta.changes)throw new RequestError('This email or account is already linked.',409);
  return json({email,verified:true},200,request);
}
export async function handleEmail(request: Request, env: EmailEnv): Promise<Response> {
  if(request.method==='OPTIONS')return preflight(request);
  const path=new URL(request.url).pathname;
  if(request.method!=='POST' || !['/api/account-email/send','/api/account-email/redeem','/api/account-email/check','/api/account-email/school','/api/account-email/school/send','/api/account-email/school/redeem','/api/account-email/school/unlink'].includes(path))return json({error:'Not found.'},404,request);
  try {
    if(!env.RESEND_API_KEY || !env.OTP_SECRET || !env.FIREBASE_SERVICE_ACCOUNT)throw new Error('Email is not configured');
    if(path.startsWith('/api/account-email/school'))return await handleSchoolEmail(request,env,path);
    const body=await readBody(request);
    const ip=request.headers.get('CF-Connecting-IP') || 'local';
    const now=Math.floor(Date.now()/1000);
    await limit(env,'ip:'+ip,3600,40);
    if(path.endsWith('/check')) {
      const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
      if(email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new RequestError('Enter a valid email address.');
      await limit(env,'lookup-global',3600,500);
      try {await requireAccount(env,email);}
      catch(e) {if(e instanceof RequestError && e.status===404)return json({exists:false},200,request);throw e;}
      return json({exists:true},200,request);
    }
    if(path.endsWith('/send')) {
      const purpose=body.purpose as Purpose;
      if(purpose!=='reset' && purpose!=='verify')throw new RequestError('Invalid request.');
      let email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
      let uid='';
      if(purpose==='verify') {
        const user=await verifyFirebaseToken(request,env.FIREBASE_PROJECT_ID);
        if(!user)throw new RequestError('Sign in to verify your email.',401);
        if(user.emailVerified)throw new RequestError('Email already verified.');
        email=user.email;uid=user.uid;
      }
      if(email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new RequestError('Enter a valid email address.');
      await limit(env,'email-minute:'+email,60,1);
      await limit(env,'email-hour:'+email,3600,5);
      await limit(env,'global',3600,100);
      const emailHash=await digest(env,'email:'+email);
      const id=crypto.randomUUID(),code=newCode();
      if(purpose==='reset')await requireAccount(env,email);
      const link=await createActionLink(env,email,purpose);
      if(!link)throw new Error('Firebase email link unavailable');
      if(link) {
        const actionCode=new URL(link).searchParams.get('oobCode');
        if(!actionCode)throw new Error('Missing action code');
        await env.EMAIL_DB.batch([
          env.EMAIL_DB.prepare('DELETE FROM email_challenges WHERE email_hash=? AND purpose=?').bind(emailHash,purpose),
          env.EMAIL_DB.prepare('INSERT INTO email_challenges (id,email_hash,uid,purpose,code_hash,action_code,expires,attempts) VALUES (?,?,?,?,?,?,?,0)')
            .bind(id,emailHash,uid,purpose,await digest(env,id+':'+code),await seal(env,actionCode),now+600)
        ]);
        try {await sendAccountEmail(env,email,purpose,code,link,id);}
        catch(e) {await env.EMAIL_DB.prepare('DELETE FROM email_challenges WHERE id=?').bind(id).run();throw e;}
      }
      return json({challengeId:id},200,request);
    }
    if(typeof body.challengeId!=='string' || !/^[0-9a-f-]{36}$/.test(body.challengeId) || typeof body.code!=='string' || !/^\d{6}$/.test(body.code))throw new RequestError('Enter the six-digit code.');
    const row=await env.EMAIL_DB.prepare('SELECT uid,purpose FROM email_challenges WHERE id=?').bind(body.challengeId).first<{uid:string;purpose:Purpose}>();
    if(row?.purpose==='verify') {
      const user=await verifyFirebaseToken(request,env.FIREBASE_PROJECT_ID);
      if(!user || user.uid!==row.uid)throw new RequestError('Sign in to verify your email.',401);
    }
    const attempt=await env.EMAIL_DB.prepare('UPDATE email_challenges SET attempts=attempts+1 WHERE id=? AND expires>? AND attempts<5 RETURNING id')
      .bind(body.challengeId,now).first();
    if(!attempt)throw new RequestError('Code expired or unavailable. Request a new one.');
    // DELETE RETURNING makes redemption single-use even for simultaneous correct attempts.
    const redeemed=await env.EMAIL_DB.prepare('DELETE FROM email_challenges WHERE id=? AND code_hash=? AND expires>? AND attempts<=5 RETURNING action_code,purpose')
      .bind(body.challengeId,await digest(env,body.challengeId+':'+body.code),now).first<{action_code:string;purpose:Purpose}>();
    if(!redeemed)throw new RequestError('Incorrect code. Try again.');
    return json({actionCode:await unseal(env,redeemed.action_code),purpose:redeemed.purpose},200,request);
  } catch(e) {
    if(e instanceof RequestError)return json({error:e.message},e.status,request);
    console.error('[account-email]',e instanceof Error?e.message:'Request failed');
    return json({error:'Could not send or verify the email. Please try again.'},503,request);
  }
}
export default {
  fetch:handleEmail,
  async scheduled(_event:ScheduledEvent,env:EmailEnv) {
    const now=Math.floor(Date.now()/1000);
    await env.EMAIL_DB.batch([
      env.EMAIL_DB.prepare('DELETE FROM email_challenges WHERE expires<?').bind(now),
      env.EMAIL_DB.prepare('DELETE FROM email_limits WHERE expires<?').bind(now),
      env.EMAIL_DB.prepare('DELETE FROM school_codes WHERE expires<?').bind(now)
    ]);
  }
};
