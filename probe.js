// This function is serialized verbatim into inspectedWindow.eval. It is the
// ONLY page-side code. Arguments are extension-generated, never captured data.
// No network APIs, DOM insertion, script loading, storage writes or Pusher calls.
// The inspected page controls its main world; this is not a hostile-page sandbox.
export function pageProbe(key, command) {
  const own = (obj, name) => {
    try { return obj && Object.getOwnPropertyDescriptor(obj, name)?.value; } catch { return undefined; }
  };
  let state = own(window, key);
  if (command === 'stop') { if (state) state.stop(); return null; }
  if (!state) {
    let active = true, queue = [], timer;
    const compact = (v, depth = 0) => {
      if (typeof v === 'string') return v.length > 8192 ? '[OMITTED: long console value]' : v;
      if (v == null || typeof v === 'number' || typeof v === 'boolean') return v;
      if (typeof v !== 'object') return '[' + typeof v + ']';
      if (depth > 3) return '[nested object]';
      const out = Object.create(null);
      // Do not invoke getters, toJSON, or page-defined string conversion.
      for (const k of Object.getOwnPropertyNames(v).slice(0, 30)) {
        const d = Object.getOwnPropertyDescriptor(v, k);
        out[k] = d && 'value' in d ? compact(d.value, depth + 1) : '[getter not evaluated]';
      }
      return out;
    };
    const record = (kind, values) => {
      if (!active) return;
      try {
        const message = values.map(v => typeof v === 'string' ? compact(v) : JSON.stringify(compact(v))).join(' ');
        queue.push({ time: Date.now(), kind, message: message.length > 16384 ? '[OMITTED: large console error]' : message });
        if (queue.length > 100) queue.shift();
      } catch { /* Never affect the application because capture failed. */ }
    };
    const onError = e => record('uncaught error', [e.message || 'Resource/script error', e.filename || '', e.lineno || '', e.error]);
    const onRejection = e => record('unhandled rejection', [e.reason]);
    const original = own(console, 'error');
    const wrapped = function (...args) {
      record('console.error', args);
      return Reflect.apply(original, this, args);
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    let consoleHook = false;
    if (typeof original === 'function') {
      try { console.error = wrapped; consoleHook = console.error === wrapped; } catch { /* frozen console */ }
    }
    state = {
      refresh() { clearTimeout(timer); timer = setTimeout(() => state.stop(), 4000); },
      drain() { const batch = queue; queue = []; return batch; },
      consoleHook,
      stop() {
        active = false; queue = []; clearTimeout(timer);
        window.removeEventListener('error', onError);
        window.removeEventListener('unhandledrejection', onRejection);
        try { if (console.error === wrapped) console.error = original; } catch { /* frozen console */ }
        try { delete window[key]; } catch { /* page may change descriptors */ }
      },
    };
    Object.defineProperty(window, key, { value: state, configurable: true });
  }
  state.refresh();
  const auth = { localStorage: [], sessionStorage: [], cookies: [], notes: [] };
  const authKey = /auth|token|jwt|session|credential|api.?key|secret|pusher/i;
  for (const area of ['localStorage', 'sessionStorage']) {
    try {
      const storage = window[area];
      const length = Math.min(storage.length, 300);
      for (let i = 0; i < length && auth[area].length < 20; i++) {
        const name = storage.key(i);
        if (name && authKey.test(name)) {
          const value = storage.getItem(name) || '';
          auth[area].push({ key: name, value: value.length <= 16384 ? value : '[OMITTED: value exceeds 16 KiB]' });
        }
      }
      if (storage.length > length || auth[area].length === 20) auth.notes.push(area + ': scan limited to 300 keys / 20 matches');
    } catch { auth.notes.push(area + ': inaccessible'); }
  }
  try {
    const cookies = document.cookie;
    if (cookies.length > 32768) auth.notes.push('Cookies omitted: exceed 32 KiB');
    else auth.cookies = cookies.split(';').filter(Boolean).slice(0, 60).map(part => {
      const pos = part.indexOf('=');
      return { name: part.slice(0, pos).trim(), value: part.slice(pos + 1) };
    });
  } catch { auth.notes.push('Document cookies inaccessible'); }
  const pusher = [], candidates = [];
  const Pusher = own(window, 'Pusher');
  const instances = own(Pusher, 'instances');
  if (Array.isArray(instances)) candidates.push(...instances.slice(0, 10));
  candidates.push(own(window, 'pusher'));
  const echo = own(window, 'Echo');
  candidates.push(own(own(echo, 'connector'), 'pusher'));
  for (const instance of [...new Set(candidates)].filter(Boolean)) {
    const connection = own(instance, 'connection');
    if (!connection) continue;
    const channels = own(own(instance, 'channels'), 'channels');
    const scalar = v => typeof v === 'string' ? (v.length <= 512 ? v : '[OMITTED: long value]') : '(unknown)';
    pusher.push({ state: scalar(own(connection, 'state')), channels: channels ? Object.keys(channels).slice(0, 60).map(name => {
      const channel = own(channels, name);
      return { channel: scalar(name), subscribed: own(channel, 'subscribed') === true, pending: own(channel, 'subscriptionPending') === true };
    }) : [], note: 'Globally exposed Pusher only; at most 60 channels. No members, socket IDs or frames collected.' });
  }
  return { time: Date.now(), url: location.href, auth, pusher, errors: state.drain(),
    note: 'Top-frame probe; ' + (state.consoleHook ? 'console.error attached.' : 'console.error unavailable; runtime errors only.') };
}

export function probeExpression(key, command = 'poll') {
  if (!/^[a-f0-9]{32}$/.test(key) || !['poll', 'stop'].includes(command)) throw new Error('Invalid probe arguments');
  return '(' + pageProbe.toString() + ')(' + JSON.stringify('__request_context_' + key) + ',' + JSON.stringify(command) + ')';
}
