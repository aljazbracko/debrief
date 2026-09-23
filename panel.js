import { buildContext, buildInspection } from './format.js';
import { createRedactor } from './redact.js';
import { TYPES, requestType, requestLabel, matchesFilters } from './filters.js';
import { renderInspection } from './inspector.js';

const $ = id => document.getElementById(id);
let store, unsubscribe, selectedId = null, rawTarget = null, lastPreview = '', renderQueued = false;
let manualRaw = false, activeType = 'api', activeTab = 'headers', selectedEntry = null;
let lastDetailsKey = '', hostKey = '', socketKey = '', viewGeneration;
const rowCache = new Map();
const displayRedactor = createRedactor();
const SVG_NS = 'http://www.w3.org/2000/svg';
let copiedTimer = 0;
const notice = (message, raw = false) => {
  $('notice').textContent = message;
  document.querySelector('footer').classList.toggle('raw-used', raw);
};
function entryFor(id) {
  if (!store || store.generation !== viewGeneration) return undefined;
  return store.entries.find(e => e.id === id) || (selectedEntry?.id === id ? selectedEntry : undefined);
}
function context(entry, raw = false) {
  try { return buildContext(entry, store.errors, { raw }); }
  catch { notice('Could not format this request. Nothing was copied.'); return null; }
}
function updatePreview() {
  const entry = entryFor(selectedId);
  $('copy-selected').disabled = !entry;
  $('copy-raw').disabled = !entry;
  if (!entry) {
    if (selectedId != null) {
      $('preview-title').textContent = 'Capture cleared.';
      $('preview-meta').textContent = 'Select another request.';
      $('preview').textContent = ''; lastPreview = ''; selectedId = null; selectedEntry = null;
      $('inspector').textContent = 'Select a request to inspect it.'; lastDetailsKey = '';
    }
    return;
  }
  if (!store.entries.includes(entry) && entry.bodyState === 'loading') {
    entry.bodyState = 'unavailable'; entry.bodyNote = 'Body was not returned before this request left the capture buffer.';
  }
  const text = context(entry);
  if (text == null) return;
  if (text !== lastPreview) { $('preview').textContent = text; lastPreview = text; }
  const methodName = entry.har.request?.method || '?';
  const statusCode = entry.har.response?.status || 0;
  const heading = `${methodName} ${statusCode || 'ERR'}  ${requestLabel(entry).name || ''}`.trim();
  $('preview-title').textContent = heading;
  $('preview-title').title = heading;
  const retained = store.entries.includes(entry);
  $('preview-meta').textContent = `${requestType(entry).toUpperCase()} · ${activeTab === 'context' ? text.length.toLocaleString() + ' characters to copy' : 'Redacted inspection · full retained detail'}${retained ? '' : ' · selected request kept open'}${entry.bodyState === 'loading' ? ' · body loading' : ''}`;
  if (activeTab !== 'context') {
    try {
      const sections = buildInspection(entry, store.errors);
      const titles = { headers: ['Request', 'Request headers', 'Query parameters', 'Response headers'], payload: ['Query parameters', 'Request payload'], response: ['Response body'], errors: ['Nearby console errors'], auth: ['Auth context', 'Pusher / WebSockets'], timing: ['Request'] };
      const key = entry.id + activeTab + JSON.stringify(sections.filter(s => titles[activeTab].includes(s.title)));
      if (key !== lastDetailsKey) { renderInspection($('inspector'), entry, sections, activeTab); lastDetailsKey = key; }
    } catch { $('inspector').textContent = 'Could not inspect this request safely.'; }
  }
}
function select(id) {
  const entry = entryFor(id);
  if (!entry) return;
  if (selectedId !== id) { $('inspector').scrollTop = 0; $('preview').scrollTop = 0; }
  selectedEntry = entry;
  selectedId = id;
  for (const row of $('request-list').children) row.classList.toggle('selected', Number(row.dataset.id) === id);
  updatePreview();
}
function writeClipboard(text, raw, id) {
  // Copy synchronously inside the user's click. No clipboardWrite permission.
  // execCommand is deprecated but keeps transient activation across DevTools
  // versions; a visible, selected-text fallback requires no permission either.
  const area = document.createElement('textarea');
  area.value = text; area.className = 'clipboard-buffer'; area.setAttribute('aria-label', 'Clipboard buffer');
  document.body.append(area);
  const focused = document.activeElement;
  area.focus(); area.select();
  let copied = false;
  try { copied = document.execCommand('copy'); } catch { /* visible fallback below */ }
  area.value = ''; area.remove(); focused?.focus();
  if (copied) {
    notice(raw ? 'RAW CONTEXT COPIED — clipboard contains unredacted data. Normal copies remain redacted.' : 'Redacted context copied. Paste it into your chat.', raw);
    markCopied(id, raw);
    return;
  }
  // No asynchronous retry with a stale raw payload in a Promise closure.
  manualRaw = raw;
  $('manual-copy').value = text;
  $('clipboard-dialog').showModal();
  $('manual-copy').focus(); $('manual-copy').select();
  notice(raw ? 'RAW TEXT READY — use ⌘C / Ctrl+C. It may contain credentials.' : 'Use ⌘C / Ctrl+C to copy the selected redacted context.', raw);
}
function copy(id, raw = false) {
  const entry = entryFor(id);
  if (!entry) { notice('This request was cleared or evicted. Select another request.'); return; }
  select(id);
  const text = context(entry, raw);
  if (text != null) writeClipboard(text, raw, id);
}
function markCopied(id, raw) {
  const buttons = raw ? [$('copy-raw')] : [$('copy-selected'), rowCache.get(id)?.querySelector('.row-copy')].filter(Boolean);
  for (const button of buttons) button.classList.add('is-copied');
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => { for (const button of buttons) button.classList.remove('is-copied'); }, 1300);
}
function svgEl(name, attrs) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}
function copyGlyphs() {
  const copy = svgEl('svg', { class: 'icon-copy', viewBox: '0 0 16 16', width: '15', height: '15', 'aria-hidden': 'true' });
  copy.append(
    svgEl('rect', { x: '4', y: '3.25', width: '8', height: '10.25', rx: '1.25' }),
    svgEl('path', { d: 'M6.15 3.25V2.7c0-.4.32-.7.72-.7h2.26c.4 0 .72.3.72.7v.55' }),
    svgEl('path', { d: 'M6.3 8.1h3.4M6.3 10.15h2.2' }),
  );
  const check = svgEl('svg', { class: 'icon-check', viewBox: '0 0 16 16', width: '15', height: '15', 'aria-hidden': 'true' });
  check.append(svgEl('path', { d: 'M3.2 8.4 6.5 11.5 12.8 4.6' }));
  return [copy, check];
}
function makeRow(entry) {
  const row = document.createElement('div'); row.className = 'request-row'; row.dataset.id = entry.id;
  row.classList.toggle('selected', selectedId === entry.id);
  const statusBlock = document.createElement('span'); statusBlock.className = 'request-status';
  const status = document.createElement('span'); status.className = 'status';
  const code = entry.har.response?.status || 0; status.textContent = code || 'ERR'; status.classList.toggle('failed', code === 0 || code >= 400);
  const method = document.createElement('span'); method.className = 'method method-' + (entry.har.request?.method || '').toLowerCase(); method.textContent = entry.har.request?.method || '?';
  statusBlock.append(status, method);
  const requestButton = document.createElement('button'); requestButton.className = 'request-name';
  const { name, host } = requestLabel(entry);
  const nameEl = document.createElement('strong'); nameEl.textContent = name;
  const hostEl = document.createElement('small'); hostEl.textContent = `${requestType(entry).toUpperCase()} · ${host}`;
  requestButton.append(nameEl, hostEl); requestButton.setAttribute('aria-label', 'Preview ' + name);
  const duration = document.createElement('span'); duration.className = 'duration'; duration.textContent = Math.round(entry.har.time || 0) + ' ms';
  const copyButton = document.createElement('button'); copyButton.className = 'row-copy icon-btn'; copyButton.type = 'button';
  copyButton.append(...copyGlyphs());
  copyButton.title = 'Copy redacted context';
  copyButton.setAttribute('aria-label', 'Copy redacted context for ' + name);
  copyButton.addEventListener('click', event => { event.stopPropagation(); copy(entry.id); });
  row.addEventListener('click', () => select(entry.id));
  row.append(statusBlock, requestButton, duration, copyButton);
  return row;
}
function filters() {
  return { type: activeType, query: $('search').value, method: $('method-filter').value, status: $('status-filter').value, host: $('host-filter').value };
}
function updateSockets() {
  $('socket-summary').hidden = activeType !== 'socket';
  if (activeType !== 'socket') return;
  const snapshot = store.snapshot;
  const safe = displayRedactor.value(Array.isArray(snapshot?.pusher) ? snapshot.pusher : []);
  const key = JSON.stringify(safe) + (store.paused ? 'paused' : 'live');
  if (key === socketKey) return;
  socketKey = key;
  const title = document.createElement('h3'); title.textContent = store.paused ? 'Pusher · capture paused' : 'Pusher · latest connection sample';
  const note = document.createElement('p'); note.className = 'muted';
  note.textContent = 'Connection summaries are independent of request filters. Handshakes appear below only when Chrome reports them; frames require Network → WS.';
  const content = document.createElement('div');
  if (!safe.length) { content.className = 'muted'; content.textContent = 'No exposed Pusher connection is available.'; }
  for (const [index, instance] of safe.entries()) {
    const block = document.createElement('div'); block.className = 'socket-instance';
    const heading = document.createElement('strong'); heading.textContent = `Connection ${index + 1} · ${instance.state}`;
    const channels = document.createElement('ul');
    for (const channel of instance.channels || []) {
      const row = document.createElement('li');
      row.textContent = `${channel.channel || channel.name || '(unnamed)'} · ${channel.subscribed ? 'subscribed' : channel.pending ? 'pending' : 'not subscribed'}`;
      channels.append(row);
    }
    if (!channels.children.length) { const row = document.createElement('li'); row.textContent = 'No channels reported'; channels.append(row); }
    block.append(heading, channels); content.append(block);
  }
  $('socket-summary').replaceChildren(title, content, note);
}
function render() {
  renderQueued = false;
  if (!store) return;
  if (viewGeneration !== store.generation) {
    viewGeneration = store.generation; selectedEntry = null;
    $('raw-dialog').close(); $('clipboard-dialog').close(); $('manual-copy').value = '';
  }
  const currentHost = $('host-filter').value;
  const hosts = [...new Set(store.entries.map(e => requestLabel(e).host).filter(Boolean))].sort();
  if (currentHost !== 'all' && !hosts.includes(currentHost)) hosts.push(currentHost);
  const nextHosts = JSON.stringify(hosts);
  if (nextHosts !== hostKey) {
    hostKey = nextHosts;
    $('host-filter').replaceChildren(new Option('All hosts', 'all'), ...hosts.map(h => new Option(h, h)));
    $('host-filter').value = currentHost;
  }
  const active = filters();
  const visible = store.entries.filter(e => matchesFilters(e, active)).slice().reverse();
  for (const button of $('type-filters').children) {
    const count = store.entries.filter(e => matchesFilters(e, { ...active, type: button.dataset.type })).length;
    button.querySelector('span').textContent = count;
    button.setAttribute('aria-pressed', String(button.dataset.type === activeType));
  }
  // Reuse rows so streaming traffic does not replace focused buttons. Preserve
  // the visible scroll anchor when new rows arrive above a scrolled list.
  const scroller = document.querySelector('.requests'), offset = scroller.scrollTop, height = scroller.scrollHeight;
  const visibleIds = new Set(visible.map(e => e.id));
  for (const [id, row] of rowCache) if (!visibleIds.has(id)) { row.remove(); rowCache.delete(id); }
  let cursor = $('request-list').firstElementChild;
  for (const entry of visible) {
    let row = rowCache.get(entry.id);
    if (!row) { row = makeRow(entry); rowCache.set(entry.id, row); }
    row.classList.toggle('selected', selectedId === entry.id);
    if (row !== cursor) $('request-list').insertBefore(row, cursor);
    cursor = row.nextElementSibling;
  }
  if (offset > 10) scroller.scrollTop = Math.max(0, offset + scroller.scrollHeight - height);
  $('empty').hidden = visible.length > 0;
  $('empty').querySelector('h2').textContent = activeType === 'socket' ? 'No captured socket handshakes.' : store.entries.length ? 'No matching requests.' : 'Waiting for requests.';
  $('empty-description').textContent = store.entries.length ? 'Try a different type or reset your filters.' : 'Use your app with DevTools open. Fetch/XHR is selected by default.';
  $('show-all').hidden = activeType === 'all';
  $('count').textContent = `${visible.length} shown · ${store.entries.length - visible.length} filtered · latest 150 retained`;
  $('capture-state').textContent = store.status;
  $('pause').textContent = store.paused ? 'Resume' : 'Pause';
  $('pause').setAttribute('aria-pressed', String(store.paused));
  $('http-only').checked = !store.pageContext;
  updateSockets();
  updatePreview();
}
function scheduleRender() {
  if (!renderQueued) { renderQueued = true; requestAnimationFrame(render); }
}
function connect() {
  if (!window.contextStore || store === window.contextStore) return;
  unsubscribe?.(); store = window.contextStore; viewGeneration = store.generation; unsubscribe = store.subscribe(scheduleRender); render();
}
window.addEventListener('context-store-ready', connect);
window.addEventListener('pagehide', () => { unsubscribe?.(); $('manual-copy').value = ''; });
$('search').addEventListener('input', render);
$('http-only').addEventListener('change', event => {
  store?.setPageContext(!event.target.checked);
  notice('Capture cleared. ' + (event.target.checked ? 'HTTP only: page storage, console and Pusher sampling are off. Request headers and bodies can still contain secrets.' : 'Page context enabled for this DevTools session.'));
});
for (const id of ['method-filter', 'status-filter', 'host-filter']) $(id).addEventListener('change', render);
for (const [type, title] of TYPES) {
  const button = document.createElement('button'); button.dataset.type = type;
  button.append(document.createTextNode(title + ' '), document.createElement('span'));
  button.addEventListener('click', () => { activeType = type; render(); });
  $('type-filters').append(button);
}
function resetFilters() {
  activeType = 'all'; $('search').value = '';
  for (const id of ['method-filter', 'status-filter', 'host-filter']) $(id).value = 'all';
  render();
}
$('reset-filters').addEventListener('click', resetFilters);
$('show-all').addEventListener('click', resetFilters);
function setTab(tab) {
  activeTab = tab;
  for (const button of $('detail-tabs').children) {
    const selected = button.dataset.tab === tab;
    button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
  }
  $('preview').hidden = tab !== 'context'; $('inspector').hidden = tab === 'context';
  $('inspector').setAttribute('aria-labelledby', 'tab-' + tab);
  updatePreview();
}
$('detail-tabs').addEventListener('click', event => { const tab = event.target.closest('[data-tab]'); if (tab) setTab(tab.dataset.tab); });
$('detail-tabs').addEventListener('keydown', event => {
  const tabs = [...$('detail-tabs').children], index = tabs.indexOf(document.activeElement);
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  setTab(tabs[next].dataset.tab); tabs[next].focus();
});
$('pause').addEventListener('click', () => store?.togglePause());
$('clear').addEventListener('click', () => {
  $('raw-dialog').close(); $('clipboard-dialog').close(); $('manual-copy').value = '';
  store?.clear(); notice('Captured data cleared from memory. Your existing clipboard is unchanged.');
});
$('copy-selected').addEventListener('click', () => copy(selectedId));
$('copy-raw').addEventListener('click', () => {
  rawTarget = selectedId; $('raw-ack').checked = false; $('raw-confirm').disabled = true; $('raw-dialog').showModal();
});
$('raw-ack').addEventListener('change', () => { $('raw-confirm').disabled = !$('raw-ack').checked; });
$('raw-confirm').addEventListener('click', () => {
  if (!$('raw-ack').checked) return;
  const target = rawTarget;
  $('raw-dialog').close(); copy(target, true);
});
$('raw-dialog').addEventListener('close', () => { rawTarget = null; $('raw-ack').checked = false; $('raw-confirm').disabled = true; });
function clearManualCopy() {
  $('manual-copy').value = '';
  if (manualRaw) notice('Raw copy was used. Your clipboard may contain credentials. Normal copies remain redacted.', true);
  manualRaw = false;
}
$('clipboard-dialog').addEventListener('close', clearManualCopy);
$('clipboard-dialog').addEventListener('cancel', clearManualCopy);
$('clipboard-dialog').querySelector('form').addEventListener('submit', clearManualCopy);
const split = $('split');
const workbench = document.querySelector('main');
function setListHeight(px) {
  const bounds = workbench.getBoundingClientRect();
  const max = Math.max(112, bounds.height - split.offsetHeight - 150);
  const next = Math.round(Math.min(Math.max(px, 112), max));
  workbench.style.setProperty('--list-h', next + 'px');
  split.setAttribute('aria-valuenow', String(next));
  split.setAttribute('aria-valuemax', String(Math.round(max)));
}
split.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  event.preventDefault();
  split.setPointerCapture(event.pointerId);
  document.body.classList.add('is-resizing');
  const top = workbench.getBoundingClientRect().top;
  const move = ev => setListHeight(ev.clientY - top);
  const stop = () => {
    document.body.classList.remove('is-resizing');
    split.removeEventListener('pointermove', move);
    split.removeEventListener('pointerup', stop);
    split.removeEventListener('pointercancel', stop);
  };
  split.addEventListener('pointermove', move);
  split.addEventListener('pointerup', stop);
  split.addEventListener('pointercancel', stop);
});
split.addEventListener('dblclick', () => { workbench.style.removeProperty('--list-h'); split.setAttribute('aria-valuenow', String(Math.round(document.querySelector('.requests').getBoundingClientRect().height))); });
split.addEventListener('keydown', event => {
  const current = document.querySelector('.requests').getBoundingClientRect().height;
  if (event.key === 'ArrowUp') { event.preventDefault(); setListHeight(current - 28); }
  if (event.key === 'ArrowDown') { event.preventDefault(); setListHeight(current + 28); }
  if (event.key === 'Home') { event.preventDefault(); workbench.style.removeProperty('--list-h'); }
});
connect();
if (typeof chrome === 'undefined' || !chrome.devtools) notice('Load this folder as an unpacked extension, then open the Debrief DevTools panel.');
else {
  try { const version = chrome.runtime.getManifest().version; if (version) $('version').textContent = version; } catch { /* opened outside the extension */ }
}
