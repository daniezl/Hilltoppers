import { handleToppings, type ToppingsEnv } from './toppings';
import { json, preflight } from './http';
export default {
  async fetch(request: Request, env: ToppingsEnv): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path !== '/api/toppings' && !path.startsWith('/api/toppings/')) return json({error:'Not found.'},404,request);
    if (request.method === 'OPTIONS') return preflight(request);
    try { return await handleToppings(request, env); }
    catch(error) {
      console.error('[toppings]', error);
      return json({error:'Topping Bar is unavailable. Please try again.'},503,request);
    }
  }
};
