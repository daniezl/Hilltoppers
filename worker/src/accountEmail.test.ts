import { beforeAll, beforeEach, afterAll, afterEach, expect, test, vi } from 'vitest';
import { Miniflare } from 'miniflare';
import { readFileSync } from 'node:fs';
import { generateKeyPair, exportPKCS8 } from 'jose';
import { handleEmail, type EmailEnv } from './accountEmail';
const identity=vi.hoisted(()=>({user:null as any}));
vi.mock('./firebaseAuth',()=>({verifyFirebaseToken:async()=>identity.user}));
let mf:Miniflare, env:EmailEnv, delivered:any[], absent:boolean, silentAbsent:boolean, lookupFailure:boolean, rejectMail:boolean;
beforeAll(async()=>{
 mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',d1Databases:['EMAIL_DB']});
 const db=await mf.getD1Database('EMAIL_DB');
 for(const sql of readFileSync(new URL('../email-schema.sql',import.meta.url),'utf8').split(';').filter(s=>s.trim()))await db.prepare(sql).run();
 const {privateKey}=await generateKeyPair('RS256',{extractable:true});
 env={EMAIL_DB:db,RESEND_API_KEY:'test-only',EMAIL_FROM:'Hilltoppers <hello@example.org>',OTP_SECRET:'test-secret',FIREBASE_PROJECT_ID:'test',FIREBASE_SERVICE_ACCOUNT:JSON.stringify({project_id:'test',client_email:'test@example.org',private_key:await exportPKCS8(privateKey)})} as unknown as EmailEnv;
});
afterAll(async()=>{await mf?.dispose();});
afterEach(()=>vi.unstubAllGlobals());
beforeEach(async()=>{
 identity.user=null;delivered=[];absent=false;silentAbsent=false;lookupFailure=false;rejectMail=false;
 await env.EMAIL_DB.batch([env.EMAIL_DB.prepare('DELETE FROM email_challenges'),env.EMAIL_DB.prepare('DELETE FROM email_limits'),env.EMAIL_DB.prepare('DELETE FROM school_codes'),env.EMAIL_DB.prepare('DELETE FROM school_links')]);
 vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit)=>{
  if(url.includes('oauth2.googleapis.com'))return Response.json({access_token:'test-token',expires_in:3600});
  if(url.endsWith('accounts:lookup'))return lookupFailure?Response.json({error:'unavailable'},{status:503}):Response.json(absent?{}:{users:[{localId:'student'}]});
  if(url.includes('identitytoolkit'))return silentAbsent?Response.json({kind:'identitytoolkit#GetOobConfirmationCodeResponse',email:'student@example.org'}):absent?Response.json({error:{message:'EMAIL_NOT_FOUND'}},{status:400}):Response.json({oobLink:'https://test.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=secret-action'});
  if(url==='https://api.resend.com/emails'){delivered.push(JSON.parse(init.body as string));return rejectMail?Response.json({error:'nope'},{status:500}):Response.json({id:'message'});}
  throw new Error('Unexpected URL');
 }));
});
function call(path:string,body:object,ip='127.0.0.1'){
 return handleEmail(new Request('https://example.org/api/account-email/'+path,{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':ip},body:JSON.stringify(body)}),env);
}
async function start(purpose='reset') {
 const response=await call('send',{email:'student@example.org',purpose});expect(response.status).toBe(200);
 return (await response.json() as any).challengeId;
}
function code(){return delivered[0].text.match(/Your code: (\d{6})/)[1];}
test('mail has link and code; DB stores neither plaintext code nor action token; redemption is single use',async()=>{
 const id=await start();expect(delivered[0].text).toContain('oobCode=secret-action');expect(code()).toMatch(/^\d{6}$/);
 const row=await env.EMAIL_DB.prepare('SELECT * FROM email_challenges').first() as any;
 expect(row.code_hash).not.toBe(code());expect(row.action_code).not.toContain('secret-action');expect(JSON.stringify(row)).not.toContain('student@example.org');
 const r=await call('redeem',{challengeId:id,code:code()});expect(await r.json()).toEqual({actionCode:'secret-action',purpose:'reset'});
 expect((await call('redeem',{challengeId:id,code:code()})).status).toBe(400);
});
test('five wrong attempts lock code, including later correct input',async()=>{
 const id=await start();const wrong=code()==='000000'?'000001':'000000';
 for(let i=0;i<5;i++)expect((await call('redeem',{challengeId:id,code:wrong})).status).toBe(400);
 expect((await call('redeem',{challengeId:id,code:code()})).status).toBe(400);
});
test('expired codes cannot be redeemed',async()=>{
 const id=await start();await env.EMAIL_DB.prepare('UPDATE email_challenges SET expires=0').run();
 expect((await call('redeem',{challengeId:id,code:code()})).status).toBe(400);
});
test('concurrent redemption only releases the action token once',async()=>{
 const id=await start();const responses=await Promise.all([call('redeem',{challengeId:id,code:code()}),call('redeem',{challengeId:id,code:code()})]);
 expect(responses.filter(r=>r.status===200)).toHaveLength(1);
});
test('verification uses authenticated email and refuses other accounts',async()=>{
 expect((await call('send',{purpose:'verify',email:'attacker@example.org'})).status).toBe(401);
 identity.user={uid:'student',email:'real@example.org',emailVerified:false};
 const id=await start('verify');expect(delivered[0].to).toEqual(['real@example.org']);
 identity.user={uid:'other'};expect((await call('redeem',{challengeId:id,code:code()})).status).toBe(401);
 identity.user={uid:'student'};expect((await call('redeem',{challengeId:id,code:code()})).status).toBe(200);
});
test('missing account is reported without sending or creating a challenge',async()=>{
 absent=true;const response=await call('send',{purpose:'reset',email:'student@example.org'});
 expect(response.status).toBe(404);expect(await response.json()).toEqual({error:'No account found with this email.'});expect(delivered).toHaveLength(0);
 expect(await env.EMAIL_DB.prepare('SELECT * FROM email_challenges').first()).toBeNull();
});
test('lookup failure is not reported as an unregistered account',async()=>{
 lookupFailure=true;const response=await call('send',{purpose:'reset',email:'student@example.org'});
 expect(response.status).toBe(503);expect(await response.json()).not.toHaveProperty('error','No account found with this email.');expect(delivered).toHaveLength(0);
});
test('resends are rate limited across IPs for same address',async()=>{
 await start();expect((await call('send',{email:'STUDENT@example.org',purpose:'reset'},'second-ip')).status).toBe(429);expect(delivered).toHaveLength(1);
});
test('provider failure does not leave a redeemable challenge',async()=>{
 rejectMail=true;expect((await call('send',{email:'student@example.org',purpose:'reset'})).status).toBe(503);
 expect(await env.EMAIL_DB.prepare('SELECT * FROM email_challenges').first()).toBeNull();
});
test('oversized and malformed requests are rejected',async()=>{
 expect((await call('send',{email:'a'.repeat(5000)})).status).toBe(413);
 expect((await call('send',{purpose:'login',email:'x@example.org'})).status).toBe(400);
});

test('missing link for an existing account is a service error, not an absent account',async()=>{
 silentAbsent=true;const response=await call('send',{purpose:'reset',email:'student@example.org'});expect(response.status).toBe(503);expect(delivered).toHaveLength(0);
});

test('login lookup distinguishes missing accounts without sending email',async()=>{
 expect(await (await call('check',{email:'student@example.org'})).json()).toEqual({exists:true});
 absent=true;expect(await (await call('check',{email:'student@example.org'})).json()).toEqual({exists:false});
 lookupFailure=true;expect((await call('check',{email:'student@example.org'})).status).toBe(503);
 expect(delivered).toHaveLength(0);
 expect(await env.EMAIL_DB.prepare('SELECT * FROM email_challenges').first()).toBeNull();
});

const personal={uid:'personal',email:'personal@example.org',emailVerified:true};
async function startSchool(email='test.student@student.stjacademy.org') {
 identity.user=personal;
 const r=await call('school/send',{email});expect(r.status).toBe(200);return (await r.json() as any).challengeId;
}
test('school email linking requires sign-in and exact school domains',async()=>{
 expect((await call('school/send',{email:'test@student.stjacademy.org'})).status).toBe(401);
 identity.user=personal;
 for(const email of ['test@example.org','test@stjacademy.org.evil.com','test@@student.stjacademy.org'])expect((await call('school/send',{email})).status).toBe(400);
 expect(delivered).toHaveLength(0);
});
test('primary school accounts show their verification status without linking',async()=>{
 identity.user={...personal,email:'test@stjacademy.org',emailVerified:false};
 expect(await (await call('school',{})).json()).toEqual({email:'test@stjacademy.org',verified:false});
 expect((await call('school/send',{email:'other@student.stjacademy.org'})).status).toBe(400);
 identity.user.emailVerified=true;expect(await (await call('school',{})).json()).toMatchObject({verified:true});
});
test('binding is account-bound, persistent, one-time and keeps primary email unchanged',async()=>{
 const id=await startSchool();const otp=code();
 identity.user={...personal,uid:'other'};expect((await call('school/redeem',{challengeId:id,code:otp})).status).toBe(400);
 identity.user=personal;expect(await (await call('school/redeem',{challengeId:id,code:otp})).json()).toEqual({email:'test.student@student.stjacademy.org',verified:true});
 expect(await (await call('school',{})).json()).toEqual({email:'test.student@student.stjacademy.org',verified:true});
 expect(identity.user.email).toBe('personal@example.org');
 expect((await call('school/redeem',{challengeId:id,code:otp})).status).toBe(409);
});
test('school codes expire and lock after five incorrect attempts',async()=>{
 let id=await startSchool();await env.EMAIL_DB.prepare('UPDATE school_codes SET expires=0').run();
 expect((await call('school/redeem',{challengeId:id,code:code()})).status).toBe(400);
 await env.EMAIL_DB.prepare('DELETE FROM email_limits').run();delivered=[];id=await startSchool();
 const wrong=code()==='000000'?'000001':'000000';
 for(let i=0;i<5;i++)expect((await call('school/redeem',{challengeId:id,code:wrong})).status).toBe(400);
 expect((await call('school/redeem',{challengeId:id,code:code()})).status).toBe(400);
});
test('two accounts cannot bind the same school email',async()=>{
 const id=await startSchool();await env.EMAIL_DB.prepare('INSERT INTO school_links VALUES (?,?,?)').bind('other','test.student@student.stjacademy.org',1).run();
 expect((await call('school/redeem',{challengeId:id,code:code()})).status).toBe(409);
 expect(await env.EMAIL_DB.prepare('SELECT * FROM school_links WHERE uid=?').bind(personal.uid).first()).toBeNull();
});
test('failed school email delivery removes the challenge',async()=>{
 identity.user=personal;rejectMail=true;
 expect((await call('school/send',{email:'teacher@stjacademy.org'})).status).toBe(503);
 expect(await env.EMAIL_DB.prepare('SELECT * FROM school_codes').first()).toBeNull();
});

test('unlink removes only caller binding and pending codes, preserves login and requires authentication',async()=>{
 expect((await call('school/unlink',{})).status).toBe(401);
 const id=await startSchool();
 await env.EMAIL_DB.prepare('INSERT INTO school_links VALUES (?,?,?)').bind(personal.uid,'test.student@student.stjacademy.org',1).run();
 await env.EMAIL_DB.prepare('INSERT INTO school_links VALUES (?,?,?)').bind('other','other@stjacademy.org',1).run();
 expect(await (await call('school/unlink',{})).json()).toEqual({email:null,verified:false});
 expect(await (await call('school',{})).json()).toEqual({email:null,verified:false});
 expect(await env.EMAIL_DB.prepare('SELECT * FROM school_codes WHERE id=?').bind(id).first()).toBeNull();
 expect(await env.EMAIL_DB.prepare('SELECT * FROM school_links WHERE uid=?').bind('other').first()).not.toBeNull();
 expect(identity.user.email).toBe(personal.email);
 identity.user={...personal,email:'teacher@stjacademy.org'};
 expect((await call('school/unlink',{})).status).toBe(400);
});
