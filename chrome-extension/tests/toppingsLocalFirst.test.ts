import { beforeEach, expect, test, vi } from 'vitest';
const sync = vi.hoisted(() => ({ prepare: vi.fn(), remote: vi.fn(), refresh: vi.fn() }));
vi.mock('../src/storage/toppingSync', () => ({
  prepareToppingAccount: sync.prepare, syncToppingAccount: sync.remote,
  refreshToppingMetadata: sync.refresh, editToppingAccount: vi.fn()
}));
vi.mock('../src/firebase/auth', () => ({ getCurrentUser: () => null, waitForAuthReady: vi.fn() }));
const topping = { id: 'weather', name: 'Weather', url: 'https://weather.example.com', installed: true };
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  sync.prepare.mockResolvedValue(undefined);
  sync.remote.mockResolvedValue(undefined);
  sync.refresh.mockResolvedValue(undefined);
  const data: Record<string, unknown> = {
    askSjaDefaultInstalledV2: true, installedToppings: [topping], toppingOrder: ['weather'], toppingInstallId: 'test'
  };
  vi.stubGlobal('navigator', { locks: { request: async (_key: string, action: () => unknown) => action() } });
  vi.stubGlobal('chrome', { storage: {
    local: { get: async (keys: string | string[]) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(k => [k, data[k]])), set: vi.fn() },
    session: { get: async () => ({}) }
  } });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ toppings: [topping] }) })));
});
test('cached list renders even when account restoration never completes', async () => {
  sync.prepare.mockReturnValue(new Promise(() => {}));
  const { localToppings } = await import('../src/services/toppingsService');
  expect(await localToppings()).toEqual([topping]);
  expect(await localToppings()).toEqual([topping]);
  expect(sync.prepare).toHaveBeenCalledTimes(1);
});
test('catalog does not wait for a slow cloud account sync', async () => {
  sync.remote.mockReturnValue(new Promise(() => {}));
  const { fetchToppings } = await import('../src/services/toppingsService');
  expect((await fetchToppings())[0].id).toBe('weather');
  expect(sync.refresh).toHaveBeenCalled();
});
