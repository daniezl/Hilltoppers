import { verifyFirebaseToken, type AppUser } from './firebaseAuth';
import { json } from './http';
import type { ToppingsEnv } from './toppings';

async function authorFor(user:AppUser|null,env:ToppingsEnv):Promise<string|null> {
  if(!user)return null;
  const domains=env.TOPPING_EMAIL_DOMAINS.split(',').map(d=>d.trim().toLowerCase());
  let email=user.email.toLowerCase();
  if(!user.emailVerified||!domains.includes(email.split('@')[1])) {
    const link=await env.SCHOOL_EMAIL_DB?.prepare('SELECT email FROM school_links WHERE uid=?').bind(user.uid).first<{email:string}>();
    if(!link||!domains.includes(link.email.toLowerCase().split('@')[1]))return null;
    email=link.email.toLowerCase();
  }
  return email.split('@')[0].split(/[._-]+/).filter(Boolean).map(p=>p[0].toUpperCase()+p.slice(1)).join(' ');
}
async function bodyOf(request:Request):Promise<any> {
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return null;
  const reader=request.body?.getReader();if(!reader)return null;
  const decoder=new TextDecoder();let size=0,text='';
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16000){await reader.cancel();return null;}text+=decoder.decode(value,{stream:true});}
  try{return JSON.parse(text+decoder.decode());}catch{return null;}
}
export async function handleSuggestions(request:Request,env:ToppingsEnv):Promise<Response> {
  const url=new URL(request.url),path=url.pathname;
  const respond=(data:unknown,status=200)=>json(data,status,request);
  const user=await verifyFirebaseToken(request,env.FIREBASE_PROJECT_ID);
  const admin=!!(user?.emailVerified&&env.TOPPING_REVIEWER_EMAIL&&user.email.toLowerCase()===env.TOPPING_REVIEWER_EMAIL.toLowerCase());
  if(path==='/api/suggestions/identity'&&request.method==='GET')return respond({author:await authorFor(user,env)});
  if(path==='/api/suggestions'&&request.method==='GET') {
    let before=Number.MAX_SAFE_INTEGER,beforeId='~';
    if(url.searchParams.has('cursor')) {
      try{const cursor=JSON.parse(url.searchParams.get('cursor')!);if(!Number.isSafeInteger(cursor.time)||typeof cursor.id!=='string'||cursor.id.length>64)throw new Error();before=cursor.time;beforeId=cursor.id;}catch{return respond({error:'Invalid page.'},400);}
    }
    const rows=await env.TOPPINGS_DB.prepare(`SELECT s.id,s.message,s.author,s.created_at AS createdAt,
      (SELECT COUNT(*) FROM suggestion_votes WHERE suggestion_id=s.id AND value=1) AS upvotes,
      (SELECT COUNT(*) FROM suggestion_votes WHERE suggestion_id=s.id AND value=-1) AS downvotes,
      COALESCE((SELECT value FROM suggestion_votes WHERE suggestion_id=s.id AND uid=?),0) AS myVote, (s.author_uid=? OR ?=1) AS canDelete
      FROM public_suggestions s WHERE (s.created_at,s.id)<(?,?) ORDER BY s.created_at DESC,s.id DESC LIMIT 31`).bind(user?.uid||'',user?.uid||'',admin?1:0,before,beforeId).all<{id:string;createdAt:number;canDelete:number}>();
    const items=rows.results.slice(0,30).map(t=>({...t,canDelete:!!t.canDelete})),last=items.at(-1);
    return respond({suggestions:items,cursor:rows.results.length>30&&last?JSON.stringify({time:last.createdAt,id:last.id}):null});
  }
  if(!user)return respond({error:'Sign in to continue.'},401);
  if(path==='/api/suggestions'&&request.method==='POST') {
    const author=await authorFor(user,env);if(!author)return respond({error:'Link and verify your school email to post publicly.'},403);
    const body=await bodyOf(request);
    if(typeof body?.message!=='string'||!body.message.trim()||body.message.length>2000)return respond({error:'Write a suggestion of up to 2,000 characters.'},400);
    if(typeof body.requestId!=='string'||!/^[0-9a-f-]{36}$/i.test(body.requestId))return respond({error:'Invalid submission.'},400);
    const existing=await env.TOPPINGS_DB.prepare('SELECT id FROM public_suggestions WHERE author_uid=? AND request_id=?').bind(user.uid,body.requestId).first();
    if(existing)return respond(existing);
    const id=crypto.randomUUID(),now=Date.now();
    const result=await env.TOPPINGS_DB.prepare(`INSERT OR IGNORE INTO public_suggestions(id,message,author_uid,author,created_at,request_id)
      SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM public_suggestions WHERE author_uid=? AND created_at>?)<10`).bind(id,body.message.trim(),user.uid,author,now,body.requestId,user.uid,now-86400000).run();
    if(!result.meta.changes){const saved=await env.TOPPINGS_DB.prepare('SELECT id FROM public_suggestions WHERE author_uid=? AND request_id=?').bind(user.uid,body.requestId).first();return saved?respond(saved):respond({error:'You can post up to 10 public suggestions per day.'},429);}
    return respond({id},201);
  }
  const deletion=/^\/api\/suggestions\/([a-zA-Z0-9-]{1,64})$/.exec(path);
  if(deletion&&request.method==='DELETE') {
    const suggestion=await env.TOPPINGS_DB.prepare('SELECT author_uid FROM public_suggestions WHERE id=?').bind(deletion[1]).first<{author_uid:string}>();
    if(!suggestion)return respond({error:'Suggestion not found.'},404);
    if(suggestion.author_uid!==user.uid&&!admin)return respond({error:'Only the author or an administrator can delete this suggestion.'},403);
    await env.TOPPINGS_DB.batch([
      env.TOPPINGS_DB.prepare('DELETE FROM suggestion_votes WHERE suggestion_id=?').bind(deletion[1]),
      env.TOPPINGS_DB.prepare('DELETE FROM public_suggestions WHERE id=?').bind(deletion[1])
    ]);
    return respond({ok:true});
  }
  const vote=/^\/api\/suggestions\/([a-zA-Z0-9-]{1,64})\/vote$/.exec(path);
  if(vote&&request.method==='POST') {
    const body=await bodyOf(request);if(![-1,0,1].includes(body?.value))return respond({error:'Choose upvote or downvote.'},400);
    const exists=await env.TOPPINGS_DB.prepare('SELECT id FROM public_suggestions WHERE id=?').bind(vote[1]).first();if(!exists)return respond({error:'Suggestion not found.'},404);
    if(body.value===0)await env.TOPPINGS_DB.prepare('DELETE FROM suggestion_votes WHERE suggestion_id=? AND uid=?').bind(vote[1],user.uid).run();
    else await env.TOPPINGS_DB.prepare('INSERT INTO suggestion_votes(suggestion_id,uid,value) VALUES (?,?,?) ON CONFLICT(suggestion_id,uid) DO UPDATE SET value=excluded.value').bind(vote[1],user.uid,body.value).run();
    const counts=await env.TOPPINGS_DB.prepare('SELECT COUNT(CASE WHEN value=1 THEN 1 END) AS upvotes,COUNT(CASE WHEN value=-1 THEN 1 END) AS downvotes FROM suggestion_votes WHERE suggestion_id=?').bind(vote[1]).first();
    return respond({...counts,myVote:body.value});
  }
  return respond({error:'Not found.'},404);
}
