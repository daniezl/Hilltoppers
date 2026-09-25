import { waitForAuthReady } from '../firebase/auth';
export interface PublicSuggestion { id:string;message:string;author:string;createdAt:number;upvotes:number;downvotes:number;myVote:number;canDelete:boolean; }
const API='https://hilltoppers-topping-bar.danielzhang089.workers.dev/api/suggestions';
export async function suggestionRequest(path='',body?:unknown,method=body?'POST':'GET') {
  const user=await waitForAuthReady();
  if(method!=='GET'&&!user)throw new Error('Sign in to continue.');
  const token=user?await user.getIdToken():null;
  const response=await fetch(API+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`} :{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not load suggestions.');return data;
}
