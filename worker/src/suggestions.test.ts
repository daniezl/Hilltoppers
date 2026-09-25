import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { Miniflare } from 'miniflare';
import { readFileSync } from 'node:fs';
import { handleSuggestions } from './suggestions';
import worker from './toppingBar';
import type { ToppingsEnv } from './toppings';
const auth=vi.hoisted(()=>({user:null as any}));
vi.mock('./firebaseAuth',()=>({verifyFirebaseToken:async()=>auth.user}));
let mf:Miniflare,env:ToppingsEnv;
const student={uid:'student',email:'amos.donn@student.stjacademy.org',emailVerified:true,displayName:'Spoof',fullName:'Spoof'};
const req=(path='',method='GET',body?:unknown)=>new Request('https://example.org/api/suggestions'+path,{method,...(body!==undefined?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
const call=(path='',method='GET',body?:unknown)=>handleSuggestions(req(path,method,body),env);
const post=(message='A suggestion',requestId=crypto.randomUUID())=>call('','POST',{message,requestId,author:'Spoof',contact:'private@example.org'});
beforeAll(async()=>{
 mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',d1Databases:['TOPPINGS_DB','SCHOOL_EMAIL_DB']});
 env={TOPPINGS_DB:await mf.getD1Database('TOPPINGS_DB'),SCHOOL_EMAIL_DB:await mf.getD1Database('SCHOOL_EMAIL_DB'),FIREBASE_PROJECT_ID:'test',TOPPING_REVIEWER_EMAIL:'daniezl@outlook.com',TOPPING_EMAIL_DOMAINS:'student.stjacademy.org,stjacademy.org'} as unknown as ToppingsEnv;
 for(const sql of readFileSync(new URL('../suggestions-schema.sql',import.meta.url),'utf8').split(';').filter(s=>s.trim()))await env.TOPPINGS_DB.prepare(sql).run();
 await env.SCHOOL_EMAIL_DB!.prepare('CREATE TABLE school_links(uid TEXT PRIMARY KEY,email TEXT NOT NULL)').run();
});
beforeEach(async()=>{auth.user=null;await env.TOPPINGS_DB.batch([env.TOPPINGS_DB.prepare('DELETE FROM suggestion_votes'),env.TOPPINGS_DB.prepare('DELETE FROM public_suggestions')]);await env.SCHOOL_EMAIL_DB!.prepare('DELETE FROM school_links').run();});
afterAll(async()=>{await mf.dispose();});
test('public reads and CORS work without login, writes require login',async()=>{
 expect(await (await worker.fetch(req(),env)).json()).toEqual({suggestions:[],cursor:null});
 expect((await worker.fetch(req('','OPTIONS'),env)).status).toBe(204);
 expect((await post()).status).toBe(401);expect((await call('/any/vote','POST',{value:1})).status).toBe(401);
});
test('requires a verified school email, trusts neither display names nor supplied author',async()=>{
 for(const patch of [{emailVerified:false},{email:'person@gmail.com'},{email:'amos@student.stjacademy.org.fake.org'}]){auth.user={...student,...patch};expect((await post()).status).toBe(403);}
 auth.user=student;expect((await post()).status).toBe(201);
 const data=await (await call()).json() as any;expect(data.suggestions[0].author).toBe('Amos Donn');
 const json=JSON.stringify(data);expect(json).not.toContain(student.email);expect(json).not.toContain('author_uid');expect(json).not.toContain('private@example.org');expect(json).not.toContain('Spoof');
});
test('linked personal accounts and teachers can publish, unlinking revokes access',async()=>{
 auth.user={...student,email:'personal@example.org'};
 await env.SCHOOL_EMAIL_DB!.prepare('INSERT INTO school_links VALUES (?,?)').bind(student.uid,student.email).run();
 expect(await (await call('/identity')).json()).toEqual({author:'Amos Donn'});expect((await post()).status).toBe(201);
 await env.SCHOOL_EMAIL_DB!.prepare('DELETE FROM school_links').run();expect((await post()).status).toBe(403);
 auth.user={...student,email:'jane.doe@stjacademy.org'};expect(await (await call('/identity')).json()).toEqual({author:'Jane Doe'});expect((await post()).status).toBe(201);
});
test('validates messages, caps daily posts and makes retry idempotent',async()=>{
 auth.user=student;for(const message of ['', ' ', 'x'.repeat(2001), 12])expect((await call('','POST',{message,requestId:crypto.randomUUID()})).status).toBe(400);
 const id=crypto.randomUUID();const first=await (await post('one',id)).json();expect(await (await post('one',id)).json()).toEqual(first);
 for(let i=0;i<9;i++)expect((await post()).status).toBe(201);
 expect((await post()).status).toBe(429);expect(await (await post('one',id)).json()).toEqual(first);
});
test('one vote per account, repeat vote is idempotent, switching and cancelling work',async()=>{
 auth.user=student;const {id}=await (await post()).json() as any;
 const vote=(value:number)=>call(`/${id}/vote`,'POST',{value});
 for(let i=0;i<2;i++)expect(await (await vote(1)).json()).toMatchObject({upvotes:1,downvotes:0,myVote:1});
 expect(await (await vote(-1)).json()).toMatchObject({upvotes:0,downvotes:1,myVote:-1});
 auth.user={...student,uid:'other'};expect(await (await vote(1)).json()).toMatchObject({upvotes:1,downvotes:1});
 expect(await (await vote(0)).json()).toMatchObject({upvotes:0,downvotes:1,myVote:0});
 expect((await vote(2)).status).toBe(400);expect((await call('/missing/vote','POST',{value:1})).status).toBe(404);
 auth.user=null;expect((await (await call()).json() as any).suggestions[0]).toMatchObject({upvotes:0,downvotes:1,myVote:0});
});
test('pagination returns all suggestions once, even with identical timestamps',async()=>{
 for(let i=0;i<35;i++)await env.TOPPINGS_DB.prepare('INSERT INTO public_suggestions VALUES(?,?,?,?,?,?)').bind(String(i).padStart(2,'0'),'Suggestion','uid','Name',123,'request'+i).run();
 const first=await (await call()).json() as any;expect(first.suggestions).toHaveLength(30);
 const second=await (await call('?cursor='+encodeURIComponent(first.cursor))).json() as any;expect(second.suggestions).toHaveLength(5);expect(second.cursor).toBe(null);
 expect(new Set([...first.suggestions,...second.suggestions].map(t=>t.id)).size).toBe(35);
 expect((await call('?cursor=bad')).status).toBe(400);
});

test('only author and verified admin may delete, removing associated votes atomically',async()=>{
 auth.user=student;const {id}=await (await post()).json() as any;
 await call(`/${id}/vote`,'POST',{value:1});
 expect((await (await call()).json() as any).suggestions[0].canDelete).toBe(true);
 auth.user=null;expect((await (await call()).json() as any).suggestions[0].canDelete).toBe(false);expect((await call('/'+id,'DELETE')).status).toBe(401);
 auth.user={...student,uid:'other'};expect((await (await call()).json() as any).suggestions[0].canDelete).toBe(false);expect((await call('/'+id,'DELETE')).status).toBe(403);
 auth.user={...student,uid:'admin',email:'daniezl@outlook.com',emailVerified:false};expect((await call('/'+id,'DELETE')).status).toBe(403);
 auth.user={...auth.user,emailVerified:true};expect((await (await call()).json() as any).suggestions[0].canDelete).toBe(true);expect((await call('/'+id,'DELETE')).status).toBe(200);
 expect((await (await call()).json() as any).suggestions).toEqual([]);
 expect(await env.TOPPINGS_DB.prepare('SELECT COUNT(*) AS total FROM suggestion_votes').first('total')).toBe(0);
 expect((await call(`/${id}/vote`,'POST',{value:1})).status).toBe(404);
 auth.user=student;const own=await (await post()).json() as any;expect((await call('/'+own.id,'DELETE')).status).toBe(200);
});
