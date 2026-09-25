import { handleToppings, type ToppingsEnv } from './toppings';
import { handleSuggestions } from './suggestions';
import { json, preflight } from './http';
export default {
  async fetch(request: Request, env: ToppingsEnv): Promise<Response> {
    const path = new URL(request.url).pathname;
    const suggestions=path==='/api/suggestions'||path.startsWith('/api/suggestions/');
    if (!suggestions && path !== '/api/toppings' && !path.startsWith('/api/toppings/')) return json({error:'Not found.'},404,request);
    if (request.method === 'OPTIONS') return preflight(request);
    try { return await (suggestions?handleSuggestions(request,env):handleToppings(request, env)); }
    catch(error) {
      console.error('[toppings]', error);
      return json({error:suggestions?'Suggestions are unavailable. Please try again.':'Topping Bar is unavailable. Please try again.'},503,request);
    }
  }
};
