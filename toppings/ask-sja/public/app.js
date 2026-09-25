const $ = selector => document.querySelector(selector);
const CACHE = 'ask-sja:conversation:v2';
const TTL = 6 * 60 * 60 * 1000;
const params = new URLSearchParams(location.search);
const embedded = parent !== window;
document.documentElement.classList.toggle('embedded', embedded);
const session = params.get('session');
const expectedHost = params.get('host');
const channel = 'hilltoppers-topping-v1';
let turns = [];
let controller;
let generation = 0;
let busy = false;
let serviceMessage = '';

window.addEventListener('message', event => {
  if (!embedded || event.source !== parent || event.origin !== expectedHost) return;
  const data = event.data;
  if (!data || data.channel !== channel || data.session !== session || data.type !== 'context') return;
  parent.postMessage({ channel, session, type: 'ready' }, event.origin);
});

function save() {
  try { localStorage.setItem(CACHE, JSON.stringify({ turns, draft: $('#question').value, updatedAt: Date.now() })); } catch { /* Chat remains usable when embedded storage is disabled. */ }
}
function safeURL(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
function sourcesFor(turn) {
  return (Array.isArray(turn.sources) ? turn.sources : []).filter(source => source && Number.isInteger(source.n) && safeURL(source.url) && typeof source.title === 'string');
}
function sourceLabel(source) {
  let title = source.kind === 'bulletin' ? 'Daily Bulletin' : source.kind === 'newsletter' ? 'SJA News' : source.title.replace(/\s*\(.*$/, '').trim();
  if (typeof source.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(source.date)) {
    title = title.replaceAll(source.date, '').replace(/[\s·—–-]+$/, '');
    // Source dates are calendar dates, not UTC timestamps to convert to local time.
    const date = new Date(`${source.date}T12:00:00Z`);
    if (Number.isFinite(date.getTime())) title += ` · ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
  }
  return title;
}
function link(source, label, className = '') {
  const a = document.createElement('a');
  a.textContent = label; a.href = safeURL(source.url); a.target = '_blank'; a.rel = 'noopener noreferrer'; a.className = className;
  return a;
}
function el(tag, className, text) {
  const node = document.createElement(tag); node.className = className;
  if (text) node.textContent = text;
  return node;
}
function render() {
  const log = $('#messages'); log.replaceChildren();
  if (!turns.length) {
    const empty = el('div', 'empty');
    empty.append(el('strong', '', 'What would you like to know?'), el('p', '', serviceMessage || 'School life, events, and the little details.'));
    log.append(empty);
  }
  for (const turn of turns) {
    const row = el('article', 'turn');
    const user = el('p', 'user', turn.question); user.setAttribute('aria-label', 'You'); row.append(user);
    const assistant = el('div', 'assistant'); assistant.setAttribute('aria-label', 'Ask SJA');
    if (turn.answer) {
      const sources = sourcesFor(turn);
      const byNumber = new Map(sources.map(source => [source.n, source]));
      const answer = el('p', 'answer');
      for (const part of turn.answer.split(/(\[\d{1,2}\])/g)) {
        const match = /^\[(\d+)\]$/.exec(part); const source = match && byNumber.get(Number(match[1]));
        answer.append(source ? link(source, match[1], 'cite') : document.createTextNode(part));
      }
      assistant.append(answer);
      if (sources.length) {
        const details = el('details', 'sources');
        const unique = [...new Map(sources.map(source => [`${source.url}|${source.date || ''}`, source])).values()];
        details.append(el('summary', '', `Sources · ${unique.length}`));
        const list = el('ul', '');
        for (const source of unique) { const li = el('li', ''); li.append(link(source, sourceLabel(source))); list.append(li); }
        details.append(list); assistant.append(details);
      }
    } else if (turn.error) {
      assistant.append(el('p', 'error', turn.error));
      const retry = el('button', 'retry', 'Try again'); retry.type = 'button'; retry.disabled = busy;
      retry.addEventListener('click', () => submit(turn.question, turn));
      if (turn === turns.at(-1)) assistant.append(retry);
    } else {
      const pending = el('div', 'thinking'); pending.setAttribute('role', 'status'); pending.setAttribute('aria-label', 'Thinking');
      for (let i = 0; i < 3; i++) pending.append(el('i', ''));
      assistant.append(pending);
    }
    row.append(assistant); log.append(row);
  }
  $('#new-chat').hidden = !turns.length;
  log.scrollTop = log.scrollHeight;
}
function fitInput() {
  const input = $('#question'); input.style.height = 'auto'; input.style.height = `${input.scrollHeight}px`;
}
function updateInput() { fitInput(); $('#send').disabled = busy || $('#question').value.trim().length < 2; }
window.addEventListener('resize', fitInput);

try {
  const cached = JSON.parse(localStorage.getItem(CACHE) || 'null');
  if (cached && Number.isFinite(cached.updatedAt) && Date.now() - cached.updatedAt < TTL && Array.isArray(cached.turns)) {
    turns = cached.turns.slice(-20).filter(turn => turn && typeof turn.question === 'string' && turn.question.length <= 500 && (turn.answer === null || typeof turn.answer === 'string'));
    for (const turn of turns) if (!turn.answer) turn.error = 'The response was interrupted. Try again.';
    $('#question').value = typeof cached.draft === 'string' ? cached.draft.slice(0, 500) : '';
  } else {
    // Carry over the last completed answer from the earlier single-question UI.
    const old = JSON.parse(localStorage.getItem('ask-sja:last-answer:v1') || 'null');
    if (old && typeof old.question === 'string' && typeof old.answer === 'string' && Number.isFinite(old.askedAt) && Date.now() - old.askedAt < TTL) turns = [old];
  }
} catch { /* Start a fresh conversation when storage is unavailable or invalid. */ }
render(); updateInput();
$('#question').addEventListener('input', () => { updateInput(); save(); });
$('#question').addEventListener('keydown', event => {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229) return;
  event.preventDefault(); if (!$('#send').disabled) $('#ask-form').requestSubmit();
});
$('#ask-form').addEventListener('submit', event => { event.preventDefault(); void submit($('#question').value); });

async function submit(raw, retryTurn) {
  const question = raw.replace(/\s+/g, ' ').trim();
  if (busy || question.length < 2 || question.length > 500) return;
  const before = retryTurn ? turns.slice(0, turns.indexOf(retryTurn)) : turns;
  const history = before.filter(turn => turn.answer).slice(-3).flatMap(turn => [
    { role: 'user', content: turn.question }, { role: 'assistant', content: turn.answer.slice(0, 3000) }
  ]);
  const turn = retryTurn || { question, answer: null, sources: [] };
  if (retryTurn) turns = before;
  turns.push(turn); turns = turns.slice(-20); turn.error = null;
  const id = ++generation;
  const abort = new AbortController(); controller = abort;
  const timeout = setTimeout(() => abort.abort(), 65000);
  busy = true; $('#question').value = ''; updateInput(); render(); save();
  try {
    const response = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, history }), signal: abort.signal });
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Could not answer right now.');
    if (typeof data.answer !== 'string' || !data.answer.trim() || !Array.isArray(data.sources)) throw new Error('The answer was incomplete. Try again.');
    if (id !== generation) return;
    Object.assign(turn, { answer: data.answer, sources: data.sources, askedAt: Date.now() });
  } catch (error) {
    if (id !== generation) return;
    turn.error = error.name === 'AbortError' ? 'That took too long. Try again.' : error instanceof TypeError ? 'Could not reach Ask SJA. Check your connection.' : error.message;
  } finally {
    clearTimeout(timeout);
    if (id === generation) { busy = false; updateInput(); render(); save(); }
  }
}
$('#new-chat').addEventListener('click', () => {
  generation++; controller?.abort(); busy = false; turns = []; $('#question').value = '';
  try { localStorage.removeItem('ask-sja:last-answer:v1'); } catch {}
  render(); updateInput(); save(); $('#question').focus();
});
fetch('/api/health').then(response => { if (!response.ok) throw new Error(); return response.json(); }).then(health => {
  if (!health.configured) { serviceMessage = 'AI answers are not configured yet.'; if (!turns.length) render(); }
}).catch(() => { serviceMessage = 'Ask SJA could not be reached. Check your connection.'; if (!turns.length) render(); });
