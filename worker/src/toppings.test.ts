import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { Miniflare } from 'miniflare';
import { readFileSync } from 'node:fs';
import { handleToppings, publicHTTPS } from './toppings';
import type { ToppingsEnv } from './toppings';
const auth = vi.hoisted(() => ({ user: null as any }));
vi.mock('./firebaseAuth', () => ({ verifyFirebaseToken: async () => auth.user }));
let mf: Miniflare;
let env: ToppingsEnv;
beforeAll(async () => {
  mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("ok")}}', d1Databases: ['TOPPINGS_DB'] });
  const db = await mf.getD1Database('TOPPINGS_DB');
  for (const sql of readFileSync(new URL('../toppings-schema.sql', import.meta.url), 'utf8').split(';').filter(s=>s.trim())) await db.prepare(sql).run();
  env = { TOPPINGS_DB: db, FIREBASE_PROJECT_ID: 'test', TOPPING_EMAIL_DOMAINS: 'student.stjacademy.org,stjacademy.org' } as unknown as ToppingsEnv;
});
afterAll(async()=>{await mf?.dispose();});
beforeEach(()=>{auth.user=null;});
const student = {uid:'student',email:'test@student.stjacademy.org',emailVerified:true,displayName:'Test S.',fullName:'Test Student'};
function request(path='',method='GET',body?:unknown) {
  return handleToppings(new Request('https://example.org/api/toppings'+path,{method,...(body ? {headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})}),env);
}
const listing={name:'Study Timer',description:'A simple timer for study sessions.',url:'https://example.org/timer',image:'https://example.org/preview.png'};
test('public catalog has no fabricated users or ratings and mutations require authentication',async()=>{
 const r=await request();expect(r.status).toBe(200);const {toppings}=await r.json() as any;
 expect(toppings[0]).toMatchObject({id:'ask-sja',users:0,rating:null,ratingCount:0});
 expect(await (await request('','POST',listing)).json()).toMatchObject({error:'Sign in to continue.'});
});
test('publishing rejects unverified, non-school, spoofed-domain and anonymous accounts',async()=>{
 for(const patch of [{emailVerified:false},{email:'test@gmail.com'},{email:'test@stjacademy.org.example.com'},{fullName:''},{fullName:'Anonymous'}]){
  auth.user={...student,...patch};expect((await request('','POST',listing)).status).toBeGreaterThanOrEqual(400);
 }
});
test('student and teacher publish without exposing email or uid',async()=>{
 for(const [uid,email] of [['student','test@student.stjacademy.org'],['teacher','test@stjacademy.org']]){
  auth.user={...student,uid,email};expect((await request('','POST',listing)).status).toBe(201);
 }
 const list=await (await request()).json() as any;
 expect(list.toppings.length).toBe(3);expect(JSON.stringify(list)).not.toContain(student.email);
 expect(list.toppings.find((t:any)=>t.name==='Study Timer').author).toBe('Test Student');
});
test('installation is idempotent, counts unique accounts and removal decrements',async()=>{
 auth.user=student;await request('/ask-sja/install','POST');await request('/ask-sja/install','POST');
 let t=(await (await request()).json() as any).toppings.find((t:any)=>t.id==='ask-sja');expect(t.users).toBe(1);
 auth.user={...student,uid:'second'};await request('/ask-sja/install','POST');
 t=(await (await request()).json() as any).toppings.find((t:any)=>t.id==='ask-sja');expect(t.users).toBe(2);
 await request('/ask-sja/install','DELETE');await request('/ask-sja/install','DELETE');
 t=(await (await request()).json() as any).toppings.find((t:any)=>t.id==='ask-sja');expect(t.users).toBe(1);
});
test('only installed users rate, stars are bounded and a revised vote replaces the old vote',async()=>{
 auth.user={...student,uid:'outsider'};expect((await request('/ask-sja/rating','POST',{stars:5})).status).toBe(403);
 auth.user=student;expect((await request('/ask-sja/rating','POST',{stars:6})).status).toBe(400);
 await request('/ask-sja/rating','POST',{stars:5});await request('/ask-sja/rating','POST',{stars:3});
 const t=(await (await request()).json() as any).toppings.find((t:any)=>t.id==='ask-sja');expect(t).toMatchObject({rating:3,ratingCount:1,myRating:3});
});
test('report saved; only author unpublishes; withdrawn listings cannot be installed',async()=>{
 auth.user=student;expect((await request('/ask-sja/report','POST',{reason:'The preview is broken.'})).status).toBe(200);
 const {id}=await (await request('','POST',listing)).json() as any;
 auth.user={...student,uid:'other'};expect((await request('/'+id,'DELETE')).status).toBe(403);
 auth.user=student;expect((await request('/'+id,'DELETE')).status).toBe(200);
 expect((await request('/'+id+'/install','POST')).status).toBe(404);
});
test('publishing validates URLs and graduation years',async()=>{
 for(const url of ['javascript:alert(1)','http://example.org','https://localhost/','https://127.0.0.1/','https://user:pass@example.org/'])expect(publicHTTPS(url)).toBe(false);
 auth.user=student;expect((await request('','POST',{...listing,graduationYear:0})).status).toBe(400);
 expect((await request('','POST',{...listing,url:'javascript:alert(1)'})).status).toBe(400);
});

const deviceA = 'b3d74d94-010c-49a3-8e71-8337d92af280';
const deviceB = 'b3d74d94-010c-49a3-8e71-8337d92af281';
function guest(path = '', method = 'GET', device = deviceA, body?: unknown) {
 return handleToppings(new Request('https://example.org/api/toppings'+path, {method,
 headers:{'X-Topping-Install-ID':device,...(body?{'Content-Type':'application/json'}:{})},
 ...(body?{body:JSON.stringify(body)}:{})}),env);
}
test('guests add and remove without authentication; per-browser count survives sign-in',async()=>{
 auth.user=student;const {id}=await (await request('','POST',listing)).json() as any;
 auth.user=null;expect((await guest('/'+id+'/install','POST')).status).toBe(200);
 await guest('/'+id+'/install','POST');
 let t=(await (await guest()).json() as any).toppings.find((t:any)=>t.id===id);expect(t).toMatchObject({users:1,installed:1});
 auth.user=student;await guest('/'+id+'/install','POST');
 t=(await (await guest()).json() as any).toppings.find((t:any)=>t.id===id);expect(t.users).toBe(1);
 expect((await guest('/'+id+'/rating','POST',deviceA,{stars:4})).status).toBe(200);
 auth.user=null;expect((await guest('/'+id+'/rating','POST',deviceA,{stars:5})).status).toBe(401);
 expect((await guest('','POST',deviceA,listing)).status).toBe(401);
 await guest('/'+id+'/install','POST',deviceB);
 await guest('/'+id+'/install','DELETE');await guest('/'+id+'/install','DELETE');
 t=(await (await guest()).json() as any).toppings.find((t:any)=>t.id===id);expect(t).toMatchObject({users:1,installed:0});
 await guest('/'+id+'/install','DELETE',deviceB);
 expect((await guest('/'+id+'/install','POST','invalid')).status).toBe(400);
});
test('authenticated upgrade replaces legacy account registration instead of double counting',async()=>{
 auth.user=student;const {id}=await (await request('','POST',listing)).json() as any;
 await request('/'+id+'/install','POST');await guest('/'+id+'/install','POST');
 const t=(await (await guest()).json() as any).toppings.find((t:any)=>t.id===id);expect(t.users).toBe(1);
});

test('verified linked school email permits publishing under the school-derived author',async()=>{
 await env.TOPPINGS_DB.prepare('CREATE TABLE IF NOT EXISTS school_links (uid TEXT PRIMARY KEY,email TEXT)').run();
 env.SCHOOL_EMAIL_DB=env.TOPPINGS_DB;
 auth.user={...student,uid:'linked-personal',email:'personal@example.org',emailVerified:false,fullName:'Untrusted name'};
 await env.TOPPINGS_DB.prepare('INSERT INTO school_links VALUES (?,?)').bind(auth.user.uid,'yaoyu.zhang@student.stjacademy.org').run();
 expect((await request('','POST',listing)).status).toBe(201);
 const catalog=await (await request()).json() as any;
 expect(catalog.toppings.find((t:any)=>t.author==='Yaoyu Zhang')).toBeTruthy();
 auth.user={...auth.user,uid:'not-linked'};expect((await request('','POST',listing)).status).toBe(403);
});

test('published icon survives the catalog and unknown icons are rejected',async()=>{
 auth.user=student;
 const r=await request('','POST',{...listing,icon:'book'});expect(r.status).toBe(201);
 const {id}=await r.json() as any;
 const catalog=await (await request()).json() as any;
 expect(catalog.toppings.find((t:any)=>t.id===id).icon).toBe('book');
 expect((await request('','POST',{...listing,icon:'https://example.org/icon.svg'})).status).toBe(400);
});
