import { beforeEach, expect, test, vi } from 'vitest';
const context = vi.hoisted(() => ({ user: { uid: 'a', emailVerified: true } as any, cloud: {} as Record<string, any>, offline: false, pause: undefined as undefined | (() => Promise<void>) }));
vi.mock('../src/firebase/auth', () => ({
  getCurrentUser: () => context.user, waitForAuthReady: async () => context.user, onAuthState: () => () => {}
}));
vi.mock('../src/firebase/app', () => ({ getDb: () => ({}) }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: any, _collection: string, uid: string) => uid,
  runTransaction: async (_db: any, action: any) => {
    if (context.offline) throw Error('offline');
    return action({ get: async (uid: string) => {
      const copy = structuredClone(context.cloud[uid]);
      if (context.pause) { const pause = context.pause; context.pause = undefined; await pause(); }
      return { data: () => copy };
    }, set: (uid: string, value: any) => { context.cloud[uid] = structuredClone(value); } });
  }
}));
import { prepareToppingAccount, editToppingAccount, syncToppingAccount, mergeToppingState } from '../src/storage/toppingSync';
import type { Topping } from '../src/services/toppingsService';
import { DEFAULT_TOPPINGS } from '../src/services/defaultToppings';
const nonDefaults = (ids: string[]) => ids.filter(id => !DEFAULT_TOPPINGS.some(t => t.id === id));
const installedIds = () => nonDefaults(data.installedToppings.map((t: Topping) => t.id));
const topping = (id: string) => ({ id, name: id, url: `https://${id}.example.com`, installed: true } as Topping);
const state = (...ids: string[]) => ({ entries: Object.fromEntries(ids.map(id => [id, { installed: true, topping: topping(id) }])), order: ids });
let data: Record<string, any>;
beforeEach(() => {
  context.user = { uid: 'a', emailVerified: true }; context.cloud = {}; context.offline = false; context.pause = undefined;
  data = { installedToppings: [topping('weather')], toppingOrder: ['weather'] };
  const queues = new Map<string, Promise<any>>();
  vi.stubGlobal('navigator', { locks: { request: (key: string, action: () => any) => {
    const next = (queues.get(key) || Promise.resolve()).catch(() => {}).then(action);
    queues.set(key, next); return next;
  } } });
  vi.stubGlobal('window', { addEventListener: vi.fn(), setInterval: vi.fn() });
  vi.stubGlobal('chrome', { storage: { local: {
    get: async (keys: string | string[]) => structuredClone(Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(k => [k, data[k]]))),
    set: async (values: object) => { Object.assign(data, structuredClone(values)); }
  } } });
});
test('first sign-in merges devices and preserves cloud order', async () => {
  context.cloud.a = { toppingPreferences: state('ask', 'todo') };
  await syncToppingAccount();
  expect(installedIds()).toEqual(['ask', 'todo', 'weather']);
  expect(nonDefaults(context.cloud.a.toppingPreferences.order)).toEqual(['ask', 'todo', 'weather']);
});
test('first-time old device cannot resurrect a cloud removal', async () => {
  const remote = state('weather'); remote.entries.weather.installed = false; remote.order = [];
  context.cloud.a = { toppingPreferences: remote };
  await syncToppingAccount();
  expect(installedIds()).toEqual([]);
  expect(context.cloud.a.toppingPreferences.entries.weather.installed).toBe(false);
});
test('offline removal survives restart and later polls', async () => {
  await syncToppingAccount(); context.offline = true;
  await editToppingAccount(topping('weather'), false); await syncToppingAccount();
  expect(installedIds()).toEqual([]);
  expect(data['toppingsAccount:a'].pending.weather).toBeDefined();
  context.offline = false; await syncToppingAccount(); await syncToppingAccount();
  expect(context.cloud.a.toppingPreferences.entries.weather.installed).toBe(false);
  expect(data['toppingsAccount:a'].pending).toEqual({});
});
test('account switching isolates pending edits and guest state', async () => {
  await syncToppingAccount(); context.offline = true;
  await editToppingAccount(topping('private'), true); await syncToppingAccount();
  context.user = { uid: 'b', emailVerified: true }; context.offline = false;
  await syncToppingAccount(); expect(installedIds()).toEqual([]);
  expect(context.cloud.b.toppingPreferences.order).toEqual(DEFAULT_TOPPINGS.map(t => t.id));
  context.user = null; await syncToppingAccount(); expect(installedIds()).toEqual([]);
  context.user = { uid: 'a', emailVerified: true }; await syncToppingAccount();
  expect(installedIds()).toEqual(['weather', 'private']);
});
test('an edit during a slow sync is retained and uploaded afterwards', async () => {
  await syncToppingAccount();
  let finish!: () => void;
  context.pause = () => new Promise<void>(resolve => { finish = resolve; });
  const reading = syncToppingAccount(); await vi.waitFor(() => expect(finish).toBeDefined());
  await editToppingAccount(topping('weather'), false);
  finish(); await reading; await syncToppingAccount();
  expect(installedIds()).toEqual([]);
  expect(context.cloud.a.toppingPreferences.entries.weather.installed).toBe(false);
});
test('a slow response from the previous account cannot replace the current list', async () => {
  await syncToppingAccount();
  let finish!: () => void;
  context.pause = () => new Promise<void>(resolve => { finish = resolve; });
  const reading = syncToppingAccount(); await vi.waitFor(() => expect(finish).toBeDefined());
  context.user = { uid: 'b', emailVerified: true }; await prepareToppingAccount();
  finish(); await reading;
  expect(installedIds()).toEqual([]);
});
test('ordering preserves concurrently installed items and excludes previews', async () => {
  await syncToppingAccount();
  context.cloud.a.toppingPreferences = state('weather', 'todo');
  await editToppingAccount(undefined, undefined, ['local-preview', 'weather']); await syncToppingAccount();
  expect(nonDefaults(context.cloud.a.toppingPreferences.order)).toEqual(['weather', 'todo']);
});
test('explicit reinstall overrides a tombstone without losing other additions', () => {
  const remote = state('weather', 'todo'); remote.entries.weather.installed = false;
  const next = mergeToppingState(remote, undefined, { weather: { id: 'edit', entry: { topping: topping('weather'), installed: true } } });
  expect(next.entries.weather.installed).toBe(true); expect(next.order).toContain('todo');
});
test('two migrated devices converge after removal instead of merging stale lists again', async () => {
  await syncToppingAccount();
  const deviceA = structuredClone(data);
  data = { installedToppings: [topping('todo')], toppingOrder: ['todo'] };
  await syncToppingAccount();
  const deviceB = structuredClone(data);
  data = deviceA;
  await editToppingAccount(topping('weather'), false); await syncToppingAccount();
  data = deviceB; await syncToppingAccount();
  expect(installedIds()).toEqual(['todo']);
  expect(context.cloud.a.toppingPreferences.entries.weather.installed).toBe(false);
});
test('unverified accounts keep edits locally until verification', async () => {
  context.user.emailVerified = false;
  await editToppingAccount(topping('todo'), true); await syncToppingAccount();
  expect(context.cloud.a).toBeUndefined();
  context.user.emailVerified = true; await syncToppingAccount();
  expect(nonDefaults(context.cloud.a.toppingPreferences.order)).toEqual(['weather', 'todo']);
});
test('default removal on another device wins over a fresh default installation', async () => {
  await syncToppingAccount();
  const first = DEFAULT_TOPPINGS[0];
  await editToppingAccount(first, false); await syncToppingAccount();
  data = { installedToppings: DEFAULT_TOPPINGS, toppingOrder: DEFAULT_TOPPINGS.map(t => t.id) };
  await syncToppingAccount();
  expect(data.installedToppings.some((t: Topping) => t.id === first.id)).toBe(false);
});
test('manual default order syncs and is not reset by later polling', async () => {
  await syncToppingAccount();
  const ids = ['weather', ...DEFAULT_TOPPINGS.map(t => t.id).reverse()];
  await editToppingAccount(undefined, undefined, ids); await syncToppingAccount();
  await syncToppingAccount();
  expect(data.toppingOrder).toEqual(ids);
  expect(context.cloud.a.toppingPreferences.orderCustomized).toBe(true);
});
