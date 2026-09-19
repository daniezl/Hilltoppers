import { getCurrentUser, waitForAuthReady } from '../firebase/auth';

interface PreferenceStore<T> {
  key: string;
  writeLocal(value: T): Promise<void>;
  readRemote(uid: string): Promise<T | null>;
  writeRemote(uid: string, value: T): Promise<void>;
}

// Keep unsent writes by account. A failed upload must never let an older cloud
// copy replace edits, and switching accounts must not upload another user's edits.
export async function savePreferences<T>(store: PreferenceStore<T>, value: T): Promise<void> {
  const user = await waitForAuthReady();
  await navigator.locks.request(store.key, async () => {
    await store.writeLocal(value);
    const revision = crypto.randomUUID();
    await chrome.storage.local.set({ [`${store.key}:revision`]: revision, [`${store.key}:owner`]: user?.uid || null });
    if (user) await chrome.storage.local.set({
      [`${store.key}:pending:${user.uid}`]: { value, revision }
    });
  });
  // Local saving is complete. Cloud outages must not block further editing.
  if (user?.emailVerified) void syncPreferences(store).catch(console.warn);
}

export async function syncPreferences<T>(store: PreferenceStore<T>): Promise<T | null> {
  const user = await waitForAuthReady();
  if (!user?.emailVerified) return null;
  return navigator.locks.request(`${store.key}:remote`, async () => {
    const pendingKey = `${store.key}:pending:${user.uid}`;
    const revisionKey = `${store.key}:revision`;
    const start = await chrome.storage.local.get([pendingKey, revisionKey]);
    const pending = start[pendingKey];
    if (pending) {
      let restored: T | null = null;
      await navigator.locks.request(store.key, async () => {
        const state = await chrome.storage.local.get([revisionKey, `${store.key}:owner`]);
        if (getCurrentUser()?.uid === user.uid && state[revisionKey] === start[revisionKey] && state[`${store.key}:owner`] !== user.uid) {
          await store.writeLocal(pending.value);
          await chrome.storage.local.set({ [revisionKey]: pending.revision, [`${store.key}:owner`]: user.uid });
          restored = pending.value;
        }
      });
      try {
        await store.writeRemote(user.uid, pending.value);
        await navigator.locks.request(store.key, async () => {
          const latest = await chrome.storage.local.get(pendingKey);
          if (latest[pendingKey]?.revision === pending.revision) await chrome.storage.local.remove(pendingKey);
        });
      } catch { /* Leave the upload queued for the next sync. */ }
      return restored;
    }
    const remote = await store.readRemote(user.uid);
    if (!remote) return null;
    return navigator.locks.request(store.key, async () => {
      const latest = await chrome.storage.local.get([pendingKey, revisionKey]);
      if (getCurrentUser()?.uid !== user.uid || latest[pendingKey] || latest[revisionKey] !== start[revisionKey]) return null;
      await store.writeLocal(remote);
      await chrome.storage.local.set({ [`${store.key}:owner`]: user.uid });
      return remote;
    });
  });
}
