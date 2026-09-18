import { getCurrentUser, waitForAuthReady } from '../firebase/auth';

export interface Topping {
  id: string; name: string; description: string; url: string; image: string;
  author: string; graduationYear: number | null; createdAt: number;
  users: number; rating: number | null; ratingCount: number;
  installed: boolean; myRating: number | null; owned: boolean;
  preview?: boolean;
}
const API = 'https://hilltoppers-topping-bar.danielzhang089.workers.dev/api/toppings';
export const TOPPINGS_KEY = 'installedToppings';
export const PREVIEW_TOPPING_KEY = 'previewTopping';
export const ASK_SJA: Topping = {
  id: 'ask-sja', name: 'Ask SJA', description: 'Answers about school life, with sources you can check.',
  url: 'https://ask-sja-topping.danielzhang089.workers.dev/', image: 'builtin:ask-sja',
  author: 'Yaoyu Zhang', graduationYear: 2027, createdAt: 0, users: 0, rating: null,
  ratingCount: 0, installed: false, myRating: null, owned: false
};
let installIdPromise: Promise<string> | undefined;
function installId(): Promise<string> {
  // One identifier per browser profile, independent of account sign-in state.
  return installIdPromise ||= navigator.locks.request('topping-install-id', async () => {
    const saved = await chrome.storage.local.get('toppingInstallId');
    if (typeof saved.toppingInstallId === 'string') return saved.toppingInstallId;
    const id = crypto.randomUUID();
    await chrome.storage.local.set({ toppingInstallId: id });
    return id;
  });
}
export async function toppingRequest(path = '', method = 'GET', body?: unknown) {
  const anonymousAllowed = method === 'GET' || path.endsWith('/install');
  const user = getCurrentUser() || (anonymousAllowed ? null : await waitForAuthReady());
  if (!anonymousAllowed && !user) throw new Error('Sign in to continue.');
  let token = '';
  if (user) {
    try { token = await user.getIdToken(); }
    catch (error) { if (!anonymousAllowed) throw error; }
  }
  const response = await fetch(API + path, {
    method, headers: { 'X-Topping-Install-ID': await installId(), ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not reach Topping Bar.');
  return data;
}
export async function localToppings(): Promise<Topping[]> {
  const [data, previewData] = await Promise.all([
    chrome.storage.local.get([TOPPINGS_KEY, 'askSjaToppingEnabled']),
    chrome.storage.session.get(PREVIEW_TOPPING_KEY)
  ]);
  const installed = Array.isArray(data[TOPPINGS_KEY]) ? data[TOPPINGS_KEY].filter((t: Topping) => {
    try { return t && typeof t.id === 'string' && typeof t.name === 'string' && new URL(t.url).protocol === 'https:'; } catch { return false; }
  }) : data.askSjaToppingEnabled ? [{ ...ASK_SJA, installed: true }] : [];
  const preview = previewData[PREVIEW_TOPPING_KEY] as Topping | undefined;
  if (preview?.preview) {
    try {
      const url = new URL(preview.url);
      if ((url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]') &&
          (url.protocol === 'http:' || url.protocol === 'https:')) installed.push(preview);
    } catch { /* Ignore an invalid local preview saved by an older build. */ }
  }
  return installed;
}
export async function savePreviewTopping(name: string, address: string): Promise<Topping> {
  const raw = address.trim();
  const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `http://${raw}`);
  const localHost = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if (!localHost || (url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
    throw new Error('Use a local address such as http://localhost:5173.');
  }
  const topping: Topping = {
    id: 'local-preview', name: name.trim() || 'Preview Topping',
    description: 'A temporary Topping from your local development server.', url: url.href,
    image: '', author: 'Only you', graduationYear: null, createdAt: Date.now(), users: 0,
    rating: null, ratingCount: 0, installed: true, myRating: null, owned: true, preview: true
  };
  await chrome.storage.session.set({ [PREVIEW_TOPPING_KEY]: topping });
  return topping;
}
const PENDING = 'toppingPendingCounts';
async function syncCounts() {
  await navigator.locks.request('topping-count-sync', async () => {
  const saved = await chrome.storage.local.get(PENDING);
  const pending: Record<string, boolean> = saved[PENDING] || {};
  for (const [id, added] of Object.entries(pending)) {
    try {
      await toppingRequest(`/${id}/install`, added ? 'POST' : 'DELETE');
      await navigator.locks.request('topping-counts', async () => {
        const latest = await chrome.storage.local.get(PENDING);
        const current = latest[PENDING] || {};
        if (current[id] === added) delete current[id];
        await chrome.storage.local.set({ [PENDING]: current });
      });
    } catch { /* Local add/remove works offline; retry counts when the catalog next opens. */ }
  }
  });
}
export async function fetchToppings(): Promise<Topping[]> {
  await syncCounts();
  let data = await toppingRequest();
  let changed = false;
  const local = await localToppings();
  // Existing Ask SJA installations become browser registrations on upgrade.
  for (const t of local) {
    if (t.preview) continue;
    const remote = data.toppings.find((x: Topping) => x.id === t.id);
    if (remote && !remote.installed) {
      try { await toppingRequest(`/${t.id}/install`, 'POST'); changed = true; } catch {}
    }
  }
  if (changed) data = await toppingRequest();
  return data.toppings.map((t: Topping) => ({ ...t, installed: local.some(x => x.id === t.id), owned: Boolean(t.owned) }));
}
export async function changeTopping(topping: Topping, added: boolean) {
  if (topping.preview) {
    if (added) await chrome.storage.session.set({ [PREVIEW_TOPPING_KEY]: { ...topping, installed: true } });
    else await chrome.storage.session.remove(PREVIEW_TOPPING_KEY);
    return;
  }
  await navigator.locks.request('topping-counts', async () => {
    const current = (await localToppings()).filter(t => !t.preview && t.id !== topping.id);
    if (added) current.push({ ...topping, installed: true });
    const saved = await chrome.storage.local.get(PENDING);
    await chrome.storage.local.set({
      [TOPPINGS_KEY]: current, askSjaToppingEnabled: current.some(t => t.id === 'ask-sja'),
      [PENDING]: { ...saved[PENDING], [topping.id]: added }
    });
  });
  await syncCounts();
}
export function openToppingBar() { chrome.tabs.create({ url: chrome.runtime.getURL('toppings.html') }); }
