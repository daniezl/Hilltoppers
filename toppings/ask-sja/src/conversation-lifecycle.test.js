import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { expect, test, vi } from 'vitest';
function setup() {
    class Element {
        value = '';
        style = {};
        disabled = false;
        scrollHeight = 28;
        children = [];
        listeners = {};
        textContent = '';
        className = '';
        append(...nodes) { this.children.push(...nodes); }
        replaceChildren() { this.children = []; }
        setAttribute() { }
        addEventListener(name, fn) { this.listeners[name] = fn; }
    }
    const nodes = Object.fromEntries(['#messages', '#question', '#send', '#ask-form'].map(id => [id, new Element()]));
    const listeners = {};
    const window = { addEventListener: (name, fn) => { listeners[name] = fn; } };
    const requests = [];
    let pending;
    let defer = false;
    const storage = { getItem: vi.fn(() => JSON.stringify({ turns: [{ question: 'Old question', answer: 'Old answer' }] })), setItem: vi.fn(), removeItem: vi.fn() };
    const context = createContext({
        document: { querySelector: (id) => nodes[id], createElement: () => new Element(), createTextNode: (text) => text, documentElement: { classList: { toggle() { } } } },
        window, parent: window, location: { search: '' }, URLSearchParams, URL, localStorage: storage,
        AbortController, setTimeout, clearTimeout,
        fetch: async (url, init) => {
            if (url === '/api/health')
                return { ok: true, json: async () => ({ configured: true }) };
            requests.push(JSON.parse(init.body));
            const response = { ok: true, json: async () => ({ answer: 'Test answer', sources: [] }) };
            if (defer)
                return new Promise(resolve => { pending = () => resolve(response); });
            return response;
        }
    });
    runInContext(readFileSync(new URL('../public/app.js', import.meta.url), 'utf8'), context);
    return { context, requests, nodes, listeners, storage, defer: () => { defer = true; }, finish: () => pending?.(null), submit: (text) => runInContext(`submit(${JSON.stringify(text)})`, context) };
}
test('ignores old saved chats, retains follow-up context only while open, and resets on reopening', async () => {
    const app = setup();
    expect(app.storage.getItem).not.toHaveBeenCalled();
    expect(app.storage.removeItem).toHaveBeenCalledWith('ask-sja:conversation:v2');
    await app.submit('First question');
    await app.submit('Follow up');
    expect(app.requests[0].history).toEqual([]);
    expect(app.requests[1].history).toEqual([{ role: 'user', content: 'First question' }, { role: 'assistant', content: 'Test answer' }]);
    app.nodes['#question'].value = 'Unsent draft';
    app.listeners.pagehide();
    app.listeners.pageshow({ persisted: true });
    expect(app.nodes['#question'].value).toBe('');
    await app.submit('Fresh question');
    expect(app.requests[2].history).toEqual([]);
    expect(app.storage.setItem).not.toHaveBeenCalled();
    const reopened = setup();
    await reopened.submit('Reopened popup');
    expect(reopened.requests[0].history).toEqual([]);
});
test('a response arriving after the popup closes cannot restore the old conversation', async () => {
    const app = setup();
    app.defer();
    const request = app.submit('Pending question');
    app.listeners.pagehide();
    app.finish();
    await request;
    expect(runInContext('turns.length', app.context)).toBe(0);
    expect(app.nodes['#send'].disabled).toBe(true);
});
