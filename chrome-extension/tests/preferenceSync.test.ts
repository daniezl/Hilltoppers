import { beforeEach, expect, test, vi } from 'vitest';
const auth = vi.hoisted(() => ({ user: { uid: 'student-a', emailVerified: true } as any }));
vi.mock('../src/firebase/auth', () => ({
  getCurrentUser: () => auth.user,
  waitForAuthReady: async () => auth.user
}));
import { savePreferences, syncPreferences } from '../src/storage/preferenceSync';

let data: Record<string, any>;
let local: string;
let cloud: string;
let offline: boolean;
let store: any;
beforeEach(() => {
  data = {}; local = 'original'; cloud = 'older'; offline = false;
  auth.user = { uid: 'student-a', emailVerified: true };
  const queues = new Map<string, Promise<any>>();
  vi.stubGlobal('navigator', { locks: { request: (key: string, action: () => any) => {
    const next = (queues.get(key) || Promise.resolve()).catch(() => {}).then(action);
    queues.set(key, next); return next;
  } } });
  vi.stubGlobal('chrome', { storage: { local: {
    get: async (keys: string | string[]) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(k => [k, data[k]])),
    set: async (values: object) => { Object.assign(data, values); },
    remove: async (key: string) => { delete data[key]; }
  } } });
  store = { key: 'classes', writeLocal: async (value: string) => { local = value; },
    readRemote: vi.fn(async () => cloud),
    writeRemote: vi.fn(async (_uid: string, value: string) => { if (offline) throw Error('offline'); cloud = value; }) };
});

test('failed upload preserves local edits, then retries without downloading older cloud data', async () => {
  offline = true;
  await savePreferences(store, 'Chemistry');
  await syncPreferences(store);
  expect(local).toBe('Chemistry'); expect(store.readRemote).not.toHaveBeenCalled();
  expect(data['classes:pending:student-a'].value).toBe('Chemistry');
  offline = false;
  await syncPreferences(store);
  expect(cloud).toBe('Chemistry'); expect(data['classes:pending:student-a']).toBeUndefined();
});

test('slow cloud read cannot overwrite an edit saved while it was loading', async () => {
  let finish!: (value: string) => void;
  store.readRemote.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const reading = syncPreferences(store);
  await vi.waitFor(() => expect(finish).toBeDefined());
  await savePreferences(store, 'New name');
  finish('Old name');
  expect(await reading).toBeNull(); expect(local).toBe('New name');
  await syncPreferences(store);
});

test('unverified accounts save locally and upload only after verification', async () => {
  auth.user.emailVerified = false;
  await savePreferences(store, 'Lunch 3');
  expect(local).toBe('Lunch 3'); expect(store.writeRemote).not.toHaveBeenCalled();
  auth.user.emailVerified = true;
  await syncPreferences(store);
  expect(cloud).toBe('Lunch 3');
});

test('switching accounts never sends another account pending edits to the new account', async () => {
  auth.user.emailVerified = false;
  await savePreferences(store, 'Account A');
  auth.user = { uid: 'student-b', emailVerified: true };
  await syncPreferences(store);
  expect(store.writeRemote).not.toHaveBeenCalled();
  expect(data['classes:pending:student-a'].value).toBe('Account A');
  auth.user = { uid: 'student-a', emailVerified: true };
  await syncPreferences(store);
  expect(local).toBe('Account A');
  expect(store.writeRemote).toHaveBeenCalledWith('student-a', 'Account A');
});
