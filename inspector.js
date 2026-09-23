// Receives already-redacted sections from format.js. Captured markup is always
// text; neither response HTML nor Markdown is rendered as executable content.
const element = (tag, text, className) => {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
};
function group(title, node) {
  const section = element('section', undefined, 'detail-section');
  section.append(element('h3', title), node);
  return section;
}
function pairs(text) {
  if (!text || text.startsWith('(')) return element('p', text || '(none)', 'muted');
  const table = element('table', undefined, 'key-values'), body = element('tbody');
  for (const line of text.split('\n')) {
    const colon = line.indexOf(': '), row = element('tr');
    const key = element('th', colon === -1 ? '—' : line.slice(0, colon)); key.scope = 'row';
    row.append(key, element('td', colon === -1 ? line : line.slice(colon + 2))); body.append(row);
  }
  table.append(body); return table;
}
function code(text) { return element('pre', text, 'detail-code'); }
function jsonTree(value) {
  let budget = 400;
  const tree = element('div', undefined, 'json-tree');
  function node(key, value, depth) {
    if (--budget < 0) return element('div', '… More content available in Text view.', 'muted');
    if (value === null || typeof value !== 'object') {
      const row = element('div', undefined, 'json-leaf');
      row.append(element('span', key + ': ', 'json-key'));
      const text = JSON.stringify(value);
      row.append(element('span', text.length > 500 ? text.slice(0, 500) + '… (see Text)' : text, 'json-value'));
      return row;
    }
    const items = Object.entries(value), details = element('details', undefined, 'json-node');
    details.open = depth < 2;
    details.append(element('summary', `${key} ${Array.isArray(value) ? '[' : '{'} ${items.length} ${Array.isArray(value) ? 'items' : 'fields'} ${Array.isArray(value) ? ']' : '}'}`));
    if (depth >= 8) details.append(element('p', 'Nesting limit — use Text view.', 'muted'));
    else {
      for (const [k, v] of items) {
        details.append(node(k, v, depth + 1));
        if (budget < 0) break;
      }
    }
    return details;
  }
  tree.append(node(Array.isArray(value) ? 'Array' : 'Object', value, 0)); return tree;
}
function payloadView(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { return code(text); }
  const wrapper = element('div'), controls = element('div', undefined, 'body-controls');
  const treeButton = element('button', 'Tree'), textButton = element('button', 'Text');
  treeButton.setAttribute('aria-pressed', 'true'); textButton.setAttribute('aria-pressed', 'false');
  controls.append(treeButton, textButton, element('span', 'Redacted · full retained body', 'muted'));
  const content = element('div'); content.append(jsonTree(parsed));
  treeButton.addEventListener('click', () => {
    content.replaceChildren(jsonTree(parsed)); treeButton.setAttribute('aria-pressed', 'true'); textButton.setAttribute('aria-pressed', 'false');
  });
  textButton.addEventListener('click', () => {
    content.replaceChildren(code(text)); treeButton.setAttribute('aria-pressed', 'false'); textButton.setAttribute('aria-pressed', 'true');
  });
  wrapper.append(controls, content); return wrapper;
}
export function renderInspection(container, entry, sections, tab) {
  const content = title => sections.find(s => s.title === title)?.text || '(unavailable)';
  const nodes = [];
  if (tab === 'headers') {
    nodes.push(group('General', code(content('Request'))),
      group('Request headers', pairs(content('Request headers'))),
      group('Query parameters', pairs(content('Query parameters'))),
      group('Response headers', pairs(content('Response headers'))));
  } else if (tab === 'payload') {
    nodes.push(group('Query parameters', pairs(content('Query parameters'))), group('Request payload', payloadView(content('Request payload'))));
  } else if (tab === 'response') {
    nodes.push(group('Response body', payloadView(content('Response body'))));
  } else if (tab === 'errors') {
    nodes.push(group('Nearby errors', code(content('Nearby console errors'))));
    nodes.push(element('p', 'From 5 seconds before start through 5 seconds after completion. Captured errors only; proximity does not prove causality.', 'muted'));
  } else if (tab === 'auth') {
    nodes.push(group('Auth snapshot', payloadView(content('Auth context'))), group('Pusher snapshot at request completion', payloadView(content('Pusher / WebSockets'))));
  } else if (tab === 'timing') {
    const rows = element('div', undefined, 'timing-rows');
    const timings = entry.har.timings || {}, total = Math.max(0, Number(entry.har.time) || 0);
    const labels = { blocked: 'Queued / blocked', dns: 'DNS lookup', connect: 'Connection', ssl: 'TLS (part of connection)', send: 'Request sent', wait: 'Waiting for response', receive: 'Content download' };
    const max = Math.max(1, total, ...Object.keys(labels).map(k => Number.isFinite(timings[k]) ? timings[k] : 0));
    for (const [key, title] of Object.entries(labels)) {
      const value = timings[key], available = Number.isFinite(value) && value >= 0;
      const row = element('div', undefined, 'timing-row'), meter = element('meter');
      meter.min = 0; meter.max = max; meter.value = available ? value : 0; meter.setAttribute('aria-label', title);
      row.append(element('span', title), meter, element('span', available ? `${Math.round(value * 100) / 100} ms` : 'N/A')); rows.append(row);
    }
    nodes.push(group(`Total · ${Math.round(total * 100) / 100} ms`, rows));
    nodes.push(element('p', 'Durations reported by Chrome. TLS overlaps connection time; bars are relative to the total, not a sequential waterfall.', 'muted'));
  }
  container.replaceChildren(...nodes);
}
