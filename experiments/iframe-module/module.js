const channel = 'hilltoppers-iframe-lab-v1';
const session = new URLSearchParams(location.search).get('session');
let hostOrigin;
let count = 0;

function send(type, fields = {}) {
  if (hostOrigin) parent.postMessage({ channel, session, type, ...fields }, hostOrigin);
}

window.addEventListener('message', event => {
  if (event.source !== parent) return;
  // This demo accepts its extension host or the documented local browser preview.
  if (!/^chrome-extension:\/\/[a-p]{32}$/.test(event.origin) && event.origin !== 'http://127.0.0.1:4173') return;
  const data = event.data;
  if (!data || data.channel !== channel || data.session !== session || data.type !== 'context') return;
  if (!['light', 'dark'].includes(data.theme) || data.date !== '2026-09-16') return;
  const first = !hostOrigin;
  hostOrigin = event.origin;
  document.body.classList.toggle('dark', data.theme === 'dark');
  document.querySelector('#context').textContent = `Host says: ${data.theme} theme · ${data.date}`;
  send(first ? 'ready' : 'pong');
  send('resize', { height: document.body.scrollHeight });
});

document.querySelector('#ping').addEventListener('click', () => send('click', { count: ++count }));
fetch('/revision.txt', { cache: 'no-store' }).then(response => response.text()).then(text => {
  document.querySelector('#revision').textContent = text.trim();
});
