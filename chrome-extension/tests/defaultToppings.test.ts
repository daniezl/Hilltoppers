import { expect, test } from 'vitest';
import { ASK_SJA, DAILY_BULLETIN, withDefaultToppings } from '../src/services/defaultToppings';
import type { ToppingState } from '../src/storage/toppingSync';
const ids = [ASK_SJA.id, DAILY_BULLETIN.id];
const state = (...order: string[]): ToppingState => ({
  entries: Object.fromEntries(order.map(id => [id, { installed: true, topping: { ...ASK_SJA, id } }])), order
});
test('fresh installs have Ask SJA first and Bulletin second', () => {
  expect(withDefaultToppings(state()).order).toEqual(ids);
});
test('default order leads an existing installation-order list without duplicates', () => {
  const result = withDefaultToppings(state('other', DAILY_BULLETIN.id, ASK_SJA.id));
  expect(result.order).toEqual([...ids, 'other']);
  expect(withDefaultToppings(result)).toEqual(result);
});
test('legacy reordered lists retain their relative order and append Bulletin', () => {
  const old = state('other', ASK_SJA.id);
  old.order.reverse();
  expect(withDefaultToppings(old).order).toEqual([ASK_SJA.id, 'other', DAILY_BULLETIN.id]);
});
test('explicit custom ordering is preserved even if it matches installation order', () => {
  expect(withDefaultToppings({ ...state('other', ASK_SJA.id), orderCustomized: true }).order)
    .toEqual(['other', ASK_SJA.id, DAILY_BULLETIN.id]);
});
test('removed defaults stay removed across migrations', () => {
  const old = state(...ids, 'other');
  old.entries[ASK_SJA.id].installed = false;
  old.entries[DAILY_BULLETIN.id].installed = false;
  old.order = ['other'];
  expect(withDefaultToppings(old).order).toEqual(['other']);
});
