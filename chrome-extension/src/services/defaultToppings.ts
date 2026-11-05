import type { Topping } from './toppingsService';
import type { ToppingState } from '../storage/toppingSync';
const API = 'https://hilltoppers-topping-bar.danielzhang089.workers.dev/api/toppings';
export const ASK_SJA: Topping = {
  id: '2e318d5f-57cf-4799-8443-f5c41cf0a1e3', icon: 'chat', name: 'Ask SJA', description: 'Answers about school life, with sources you can check.',
  url: 'https://ask-sja-topping.danielzhang089.workers.dev/', image: `${API}/2e318d5f-57cf-4799-8443-f5c41cf0a1e3/image`,
  author: 'Yaoyu Zhang', graduationYear: null, createdAt: 1790260441173, users: 0, rating: null,
  ratingCount: 0, installed: false, myRating: null, owned: false
};

export const DAILY_BULLETIN: Topping = {
  id: '4600f25b-0ff9-4538-8c7f-f572767b0999', icon: 'book', name: 'Hilltoppers Bulletin',
  description: 'Miss the info in chapel? Hilltoppers Bulletin has you covered.',
  url: 'https://sja-daily-bulletin.amos-donn.workers.dev/',
  image: `${API}/4600f25b-0ff9-4538-8c7f-f572767b0999/image`,
  author: 'Amos Donn', graduationYear: null, createdAt: 1793238255363,
  users: 0, rating: null, ratingCount: 0, installed: false, myRating: null, owned: false,
  heightMode: 'content', screenCapture: false
};
export const DEFAULT_TOPPINGS = [ASK_SJA, DAILY_BULLETIN];

export function hasCustomOrder(state: ToppingState): boolean {
  if (state.orderCustomized !== undefined) return state.orderCustomized;
  // Older versions recorded order but not whether it was edited. Preserve any
  // order that differs from installation order rather than overwrite it.
  const installed = Object.keys(state.entries).filter(id => state.entries[id].installed);
  const order = state.order.filter(id => state.entries[id]?.installed);
  return order.some((id, index) => id !== installed[index]);
}

export function withDefaultToppings(state: ToppingState): ToppingState {
  const orderCustomized = hasCustomOrder(state);
  const entries = { ...state.entries };
  for (const topping of DEFAULT_TOPPINGS) {
    // A removal tombstone is a choice, including one synced from another device.
    if (!Object.prototype.hasOwnProperty.call(entries, topping.id)) {
      entries[topping.id] = { installed: true, topping: { ...topping, installed: true } };
    }
  }
  const ids = [...new Set([...state.order, ...Object.keys(entries)])].filter(id => entries[id]?.installed);
  const defaults = DEFAULT_TOPPINGS.map(t => t.id).filter(id => entries[id]?.installed);
  return { entries, orderCustomized,
    order: orderCustomized ? ids : [...defaults, ...ids.filter(id => !defaults.includes(id))] };
}
