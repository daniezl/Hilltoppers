import { doc, runTransaction } from 'firebase/firestore';
import { getDb } from '../firebase/app';
import { getCurrentUser, onAuthState, waitForAuthReady } from '../firebase/auth';
import type { Topping } from '../services/toppingsService';

interface Entry { installed: boolean; topping: Topping }
export interface ToppingState { entries: Record<string, Entry>; order: string[] }
interface Operation { id: string; entry: Entry }
interface LocalState {
  state: ToppingState;
  seed?: ToppingState;
  pending: Record<string, Operation>;
  orderEdit?: { id: string; order: string[] };
}
const OWNER = 'toppingsAccount';
const LEGACY = 'toppingsLegacyClaimed';
const LOCK = 'toppings-account-local';
const key = (uid: string | null) => `toppingsAccount:${uid || 'guest'}`;
const empty = (): ToppingState => ({ entries: {}, order: [] });
const fresh = (state = empty()): LocalState => ({ state, pending: {} });

export function mergeToppingState(remote: ToppingState, seed?: ToppingState,
  pending: Record<string, Operation> = {}, order?: string[]): ToppingState {
  const entries = { ...remote.entries };
  // An existing tombstone wins over an old device's first-time import.
  for (const [id, entry] of Object.entries(seed?.entries || {})) {
    if (!Object.prototype.hasOwnProperty.call(entries, id)) entries[id] = entry;
  }
  // Explicit edits are applied in server acceptance order, including offline edits.
  for (const [id, operation] of Object.entries(pending)) entries[id] = operation.entry;
  const ids = [...new Set([...(order || remote.order), ...(seed?.order || []), ...Object.keys(entries)])];
  return { entries, order: ids.filter(id => entries[id]?.installed) };
}

async function project(state: ToppingState) {
  const saved = await chrome.storage.local.get(['installedToppings', 'toppingOrder', 'toppingPendingCounts', 'toppingCatalogIds']);
  const available: string[] | undefined = saved.toppingCatalogIds;
  const installed = state.order.filter(id => state.entries[id]?.installed && (!available || available.includes(id)))
    .map(id => ({ ...state.entries[id].topping, installed: true }));
  const before: Topping[] = saved.installedToppings || [];
  const pending = { ...saved.toppingPendingCounts };
  for (const t of before) if (!installed.some(x => x.id === t.id)) pending[t.id] = false;
  for (const t of installed) if (!before.some(x => x.id === t.id)) pending[t.id] = true;
  const values: Record<string, unknown> = {};
  if (JSON.stringify(before) !== JSON.stringify(installed)) values.installedToppings = installed;
  if (JSON.stringify(saved.toppingOrder) !== JSON.stringify(state.order)) values.toppingOrder = state.order;
  if (JSON.stringify(pending) !== JSON.stringify(saved.toppingPendingCounts)) values.toppingPendingCounts = pending;
  if (Object.keys(values).length) await chrome.storage.local.set(values);
}

// Called only under LOCK; the legacy browser list is claimed by at most one account.
async function select(uid: string | null): Promise<LocalState> {
  const saved = await chrome.storage.local.get([OWNER, LEGACY, key(uid), key(null), 'installedToppings', 'toppingOrder']);
  let local = saved[key(uid)] as LocalState | undefined;
  if (!local) {
    local = fresh();
    if (!saved[LEGACY]) {
      const guest = saved[key(null)] as LocalState | undefined;
      const entries = Object.fromEntries(((saved.installedToppings || []) as Topping[])
        .filter(t => !t.preview).map(t => [t.id, { installed: true, topping: t }]));
      local.state = guest?.state || { entries, order: saved.toppingOrder || Object.keys(entries) };
      if (uid) local.seed = local.state;
    }
  }
  await chrome.storage.local.set({ [key(uid)]: local, [OWNER]: uid, ...(uid ? { [LEGACY]: true } : {}) });
  await project(local.state);
  return local;
}

let started = false;
export async function prepareToppingAccount() {
  const user = await waitForAuthReady();
  await navigator.locks.request(LOCK, async () => {
    if ((getCurrentUser()?.uid || null) !== (user?.uid || null)) return;
    await select(user?.uid || null);
  });
  if (!started) {
    started = true;
    const sync = () => { void syncToppingAccount().catch(console.warn); };
    onAuthState(sync);
    window.addEventListener('online', sync);
    window.addEventListener('focus', sync);
    window.setInterval(sync, 30000);
  }
}

export async function editToppingAccount(topping?: Topping, installed?: boolean, order?: string[]) {
  const user = await waitForAuthReady();
  const uid = user?.uid || null;
  await navigator.locks.request(LOCK, async () => {
    if ((getCurrentUser()?.uid || null) !== uid) throw new Error('Account changed. Please try again.');
    const local = await select(uid);
    if (topping) {
      // Firestore rejects undefined optional metadata fields.
      const entry: Entry = { installed: !!installed, topping: JSON.parse(JSON.stringify(topping)) };
      local.pending[topping.id] = { id: crypto.randomUUID(), entry };
    }
    if (order) local.orderEdit = { id: crypto.randomUUID(), order: order.filter(id => id !== 'local-preview') };
    local.state = mergeToppingState(local.state, undefined, local.pending, local.orderEdit?.order);
    await chrome.storage.local.set({ [key(uid)]: local });
    await project(local.state);
  });
  void syncToppingAccount().catch(console.warn);
}

export async function syncToppingAccount() {
  const user = await waitForAuthReady();
  const uid = user?.uid || null;
  const start = await navigator.locks.request(LOCK, async () => {
    if ((getCurrentUser()?.uid || null) !== uid) return null;
    return select(uid);
  });
  if (!start || !user?.emailVerified) return;
  await navigator.locks.request(`toppings-account-remote:${uid}`, async () => {
    // Read after acquiring the remote lock so a queued sync never replays old edits.
    const saved = await chrome.storage.local.get(key(uid));
    const sent = saved[key(uid)] as LocalState;
    const ref = doc(getDb(), 'users', user.uid);
    let remote: ToppingState;
    try {
      remote = await runTransaction(getDb(), async transaction => {
        const snapshot = await transaction.get(ref);
        const old = (snapshot.data()?.toppingPreferences as ToppingState | undefined) || empty();
        const next = mergeToppingState(old, sent.seed, sent.pending, sent.orderEdit?.order);
        if (JSON.stringify(old) !== JSON.stringify(next)) {
          transaction.set(ref, { toppingPreferences: next }, { mergeFields: ['toppingPreferences'] });
        }
        return next;
      });
    } catch { return; /* Keep pending operations for the next online attempt. */ }
    await navigator.locks.request(LOCK, async () => {
      const latest = (await chrome.storage.local.get(key(uid)))[key(uid)] as LocalState;
      for (const [id, operation] of Object.entries(sent.pending)) {
        if (latest.pending[id]?.id === operation.id) delete latest.pending[id];
      }
      if (latest.orderEdit?.id === sent.orderEdit?.id) delete latest.orderEdit;
      delete latest.seed;
      latest.state = mergeToppingState(remote, undefined, latest.pending, latest.orderEdit?.order);
      await chrome.storage.local.set({ [key(uid)]: latest });
      if (getCurrentUser()?.uid === uid) await project(latest.state);
    });
  });
}

export async function refreshToppingMetadata(catalog: Topping[]) {
  await navigator.locks.request(LOCK, async () => {
    await chrome.storage.local.set({ toppingCatalogIds: catalog.map(t => t.id) });
    const uid = getCurrentUser()?.uid || null;
    const local = await select(uid);
    for (const topping of catalog) {
      if (local.state.entries[topping.id]) local.state.entries[topping.id].topping = topping;
    }
    await chrome.storage.local.set({ [key(uid)]: local });
    await project(local.state);
  });
}
