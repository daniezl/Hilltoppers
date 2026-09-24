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
  await db.prepare(`INSERT INTO toppings (id,name,description,url,image,author_uid,author,graduation_year,created_at,hidden,icon,status) VALUES (
 'ask-sja', 'Ask SJA', 'Answers about school life, with sources you can check.',
 'https://ask-sja-topping.danielzhang089.workers.dev/',
 'builtin:ask-sja', 'hilltoppers', 'Yaoyu Zhang', 2027, 1789603200000, 0, 'chat', 'approved'
)
ON CONFLICT(id) DO UPDATE SET
 author = excluded.author,
 graduation_year = excluded.graduation_year;`).run();
  env = { TOPPINGS_DB: db, FIREBASE_PROJECT_ID: 'test', TOPPING_EMAIL_DOMAINS: 'student.stjacademy.org,stjacademy.org', TOPPING_REVIEWER_EMAIL:'reviewer@example.org' } as unknown as ToppingsEnv;
});
afterAll(async()=>{await mf?.dispose();});
beforeEach(()=>{auth.user=null;});
const student = {uid:'student',email:'test@student.stjacademy.org',emailVerified:true,displayName:'Test S.',fullName:'Test Student'};
function request(path='',method='GET',body?:unknown) {
  return handleToppings(new Request('https://example.org/api/toppings'+path,{method,...(body ? {headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})}),env);
}
const listing={icon:'chat',name:'Study Timer',description:'A simple timer for study sessions.',url:'https://example.org/timer',image:'https://example.org/preview.png'};
test('public catalog has no fabricated users or ratings and mutations require authentication',async()=>{
 const r=await request();expect(r.status).toBe(200);const {toppings}=await r.json() as any;
 expect(toppings[0]).toMatchObject({id:'ask-sja',users:0,rating:null,ratingCount:0});
 expect(await (await publishedFixture()).json()).toMatchObject({error:'Sign in to continue.'});
});
test('publishing rejects unverified, non-school, spoofed-domain accounts',async()=>{
 for(const patch of [{emailVerified:false},{email:'test@gmail.com'},{email:'test@stjacademy.org.example.com'}]){
  auth.user={...student,...patch};expect((await publishedFixture()).status).toBeGreaterThanOrEqual(400);
 }
});
test('student and teacher publish without exposing email or uid',async()=>{
 for(const [uid,email] of [['student','test@student.stjacademy.org'],['teacher','test@stjacademy.org']]){
  auth.user={...student,uid,email};expect((await publishedFixture()).status).toBe(201);
 }
 const list=await (await request()).json() as any;
 expect(list.toppings.length).toBe(3);expect(JSON.stringify(list)).not.toContain(student.email);
 expect(list.toppings.find((t:any)=>t.name==='Study Timer').author).toBe('Test');
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
 const {id}=await (await publishedFixture()).json() as any;
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
 auth.user=student;const {id}=await (await publishedFixture()).json() as any;
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
 auth.user=student;const {id}=await (await publishedFixture()).json() as any;
 await request('/'+id+'/install','POST');await guest('/'+id+'/install','POST');
 const t=(await (await guest()).json() as any).toppings.find((t:any)=>t.id===id);expect(t.users).toBe(1);
});

test('verified linked school email permits publishing under the school-derived author',async()=>{
 await env.TOPPINGS_DB.prepare('CREATE TABLE IF NOT EXISTS school_links (uid TEXT PRIMARY KEY,email TEXT)').run();
 env.SCHOOL_EMAIL_DB=env.TOPPINGS_DB;
 auth.user={...student,uid:'linked-personal',email:'personal@example.org',emailVerified:false,fullName:'Untrusted name'};
 await env.TOPPINGS_DB.prepare('INSERT INTO school_links VALUES (?,?)').bind(auth.user.uid,'yaoyu.zhang@student.stjacademy.org').run();
 expect((await publishedFixture()).status).toBe(201);
 const catalog=await (await request()).json() as any;
 expect(catalog.toppings.find((t:any)=>t.author==='Yaoyu Zhang')).toBeTruthy();
 auth.user={...auth.user,uid:'not-linked'};expect((await publishedFixture()).status).toBe(403);
});

test('published icon survives the catalog and unknown icons are rejected',async()=>{
 auth.user=student;
 const r=await publishedFixture({...listing,icon:'book'});expect(r.status).toBe(201);
 const {id}=await r.json() as any;
 const catalog=await (await request()).json() as any;
 expect(catalog.toppings.find((t:any)=>t.id===id).icon).toBe('book');
 expect((await request('','POST',{...listing,icon:'https://example.org/icon.svg'})).status).toBe(400);
});

// Existing install/rating tests use fixtures that have already passed review.
async function publishedFixture(body:Record<string,unknown>=listing) {
 const response=await request('','POST',body);
 if(response.status===201){const {id}=await response.clone().json() as any;await env.TOPPINGS_DB.prepare("UPDATE toppings SET status='approved' WHERE id=?").bind(id).run();}
 return response;
}
const reviewer={...student,uid:'reviewer',email:'reviewer@example.org'};
test('legacy clients cannot spoof authors or bypass review; only verified reviewer approves',async()=>{
 auth.user={...student,email:'amos.donn@student.stjacademy.org',fullName:'Fake Author'};
 const r=await request('','POST',{...listing,author:'Fake Author',status:'approved'});
 expect(r.status).toBe(201);const {id,status}=await r.json() as any;expect(status).toBe('pending');
 let mine=await (await request('/submissions')).json() as any;
 expect(mine.toppings.find((t:any)=>t.id===id)).toMatchObject({author:'Amos Donn',status:'pending'});
 auth.user=null;
 expect((await request('/submissions')).status).toBe(401);
 expect((await (await request()).json() as any).toppings.some((t:any)=>t.id===id)).toBe(false);
 expect((await guest('/'+id+'/install','POST')).status).toBe(404);
 auth.user={...student,uid:'outsider'};
 expect((await (await request('/submissions')).json() as any).toppings.some((t:any)=>t.id===id)).toBe(false);
 expect((await request('/'+id+'/review','POST',{status:'approved'})).status).toBe(403);
 expect((await request('/'+id+'/rating','POST',{stars:5})).status).toBe(404);
 auth.user={...reviewer,emailVerified:false};expect((await request('/'+id+'/review','POST',{status:'approved'})).status).toBe(403);
 auth.user=reviewer;
 expect((await (await request('/submissions')).json() as any).canReview).toBe(true);
 expect((await request('/'+id+'/review','POST',{status:'approved'})).status).toBe(200);
 expect((await request('/'+id+'/review','POST',{status:'rejected'})).status).toBe(409);
 auth.user=null;
 expect((await (await request()).json() as any).toppings.find((t:any)=>t.id===id).author).toBe('Amos Donn');
 expect((await guest('/'+id+'/install','POST')).status).toBe(200);
});
test('uploaded previews persist with correct content type; rejected submissions remain private',async()=>{
 auth.user=student;
 const imageData='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1EAAAAASUVORK5CYII=';
 const r=await request('','POST',{...listing,image:undefined,imageData});expect(r.status).toBe(201);
 const {id}=await r.json() as any;
 const image=await request('/'+id+'/image');expect(image.status).toBe(200);expect(image.headers.get('Content-Type')).toBe('image/png');expect((await image.arrayBuffer()).byteLength).toBeGreaterThan(8);
 const mine=await (await request('/submissions')).json() as any;expect(mine.toppings.find((t:any)=>t.id===id).image).toBe('https://example.org/api/toppings/'+id+'/image');
 auth.user=reviewer;expect((await request('/'+id+'/review','POST',{status:'rejected'})).status).toBe(200);
 expect((await (await request()).json() as any).toppings.some((t:any)=>t.id===id)).toBe(false);
 auth.user=student;expect((await request('/'+id,'DELETE')).status).toBe(200);expect((await request('/'+id+'/image')).status).toBe(404);
 for(const bad of ['data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,SGVsbG8=', 'data:image/png;base64,'+'A'.repeat(700004)])expect((await request('','POST',{...listing,imageData:bad})).status).toBe(400);
});

test('description is optional and icon requires an explicit choice',async()=>{
 auth.user={...student,uid:'required-fields'};
 for(const description of [undefined,'','Hi'])expect((await request('','POST',{...listing,description})).status).toBe(201);
 for(const icon of [undefined,'',null])expect((await request('','POST',{...listing,icon})).status).toBe(400);
});

test('own submissions are scoped to the author and include withdrawn items',async()=>{
 auth.user={...student,uid:'own-list-test'};
 const {id}=await (await request('','POST',listing)).json() as any;
 expect((await (await request('/submissions?own=1')).json() as any).toppings.map((t:any)=>t.id)).toEqual([id]);
 await request('/'+id,'DELETE');
 expect((await (await request('/submissions?own=1')).json() as any).toppings[0]).toMatchObject({id,hidden:1});
 auth.user={...student,uid:'reviewer',email:'reviewer@example.org'};
 expect((await (await request('/submissions?own=1')).json() as any).toppings.some((t:any)=>t.id===id)).toBe(false);
 auth.user=null;expect((await request('/submissions?own=1')).status).toBe(401);
});
test('only a verified reviewer can unpublish another author listing',async()=>{
 auth.user={...student,uid:'moderation-author'};
 const {id}=await (await publishedFixture()).json() as any;
 auth.user={...student,uid:'outsider'};expect((await request('/'+id,'DELETE')).status).toBe(403);
 auth.user={...student,uid:'reviewer',email:'reviewer@example.org',emailVerified:false};expect((await request('/'+id,'DELETE')).status).toBe(403);
 auth.user={...auth.user,emailVerified:true};expect((await request('/'+id,'DELETE')).status).toBe(200);
 expect((await request('/'+id+'/install','POST')).status).toBe(404);
});

test('edits stay private until approved and preserve installs and identity',async()=>{
 auth.user={...student,uid:'editing-author'};
 const {id}=await (await publishedFixture()).json() as any;
 await request('/'+id+'/install','POST');
 auth.user={...student,uid:'outsider'};expect((await request('/'+id+'/edit','POST',{...listing,name:'Revised Timer'})).status).toBe(403);
 auth.user={...student,uid:'editing-author'};
 expect((await request('/'+id+'/edit','POST',{...listing,name:'Revised Timer',icon:'book',author:'Fake',imageData:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1EAAAAASUVORK5CYII='})).status).toBe(200);
 let live=(await (await request()).json() as any).toppings.find((t:any)=>t.id===id);expect(live.name).toBe(listing.name);expect(live.icon).toBe('chat');
 const own=(await (await request('/submissions?own=1')).json() as any).toppings.find((t:any)=>t.id===id);expect(own).toMatchObject({name:'Revised Timer',revisionStatus:'pending'});
 auth.user={...student,uid:'reviewer',email:'reviewer@example.org'};
 expect((await (await request('/submissions')).json() as any).toppings.find((t:any)=>t.id===id)).toMatchObject({name:'Revised Timer',status:'pending'});
 expect((await request('/'+id+'/review','POST',{status:'approved'})).status).toBe(200);
 live=(await (await request()).json() as any).toppings.find((t:any)=>t.id===id);expect(live).toMatchObject({name:'Revised Timer',icon:'book',users:1});expect(live.author).not.toBe('Fake');expect((await request('/'+id+'/image')).headers.get('Content-Type')).toBe('image/png');
 auth.user={...student,uid:'editing-author'};await request('/'+id+'/edit','POST',{...listing,name:'Rejected edit'});
 auth.user={...student,uid:'reviewer',email:'reviewer@example.org'};await request('/'+id+'/review','POST',{status:'rejected'});
 expect((await (await request()).json() as any).toppings.find((t:any)=>t.id===id).name).toBe('Revised Timer');
});
