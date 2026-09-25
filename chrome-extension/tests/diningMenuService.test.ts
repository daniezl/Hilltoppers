import { afterEach, expect, test, vi } from 'vitest';
import { loadDiningMenuFirstItems } from '../src/services/diningMenuService';

const meal = (dish: string) => ({ breakfast: { globalFare: [dish] } });
function feed(data: object) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => data }));
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

test('after school midnight selects today even when yesterday is first in the feed', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-25T04:30:00Z'));
  feed({ menuDate: '2026-09-24', menus: meal('Yesterday'), days: {
    '2026-09-24': meal('Yesterday'), '2026-09-25': meal('Today')
  } });
  const result = await loadDiningMenuFirstItems('Breakfast');
  expect(result.dateKey).toBe('2026-09-25');
  expect(result.globalFareFirst).toBe('Today');
});

test('before school midnight still selects the school date even when UTC is tomorrow', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-25T02:00:00Z'));
  feed({ days: { '2026-09-24': meal('Today'), '2026-09-25': meal('Tomorrow') } });
  expect((await loadDiningMenuFirstItems('Breakfast')).dateKey).toBe('2026-09-24');
});

test('keeps explicit day selection', async () => {
  feed({ days: { '2026-09-24': meal('Thursday'), '2026-09-25': meal('Friday') } });
  expect((await loadDiningMenuFirstItems('Breakfast', '2026-09-25')).globalFareFirst).toBe('Friday');
});

test('does not substitute another day when the requested day is missing', async () => {
  feed({ menuDate: '2026-09-24', menus: meal('Yesterday') });
  await expect(loadDiningMenuFirstItems('Breakfast', '2026-09-25')).rejects.toMatchObject({ code: 'no_date' });
});

test('supports old feeds only for their actual date', async () => {
  feed({ menuDate: '2026-09-24', menus: meal('Thursday') });
  expect((await loadDiningMenuFirstItems('Breakfast', '2026-09-24')).globalFareFirst).toBe('Thursday');
});

test('does not borrow legacy dishes for a different date with missing menus', async () => {
  feed({ menuDate: '2026-09-24', menus: meal('Yesterday'), days: { '2026-09-25': null } });
  await expect(loadDiningMenuFirstItems('Breakfast', '2026-09-25')).rejects.toMatchObject({ code: 'parse' });
});
