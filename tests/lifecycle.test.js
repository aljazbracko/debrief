import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createStore } from '../store.js';
import { probeExpression } from '../probe.js';
import { LIMITS } from '../format.js';

const event = () => {
  const listeners = new Set();
  return { addListener: f => listeners.add(f), removeListener: f => listeners.delete(f), emit: value => { for (const f of listeners) f(value); } };
};
function harness({ deferredHAR = false, pageContextEnabled } = {}) {
  let harCallback;
  const api = { network: { onRequestFinished: event(), onNavigated: event(), getHAR: cb => { harCallback = cb; if (!deferredHAR) cb({ entries: [] }); } },
    inspectedWindow: { eval: (expression, cb) => cb(expression.endsWith(',"stop")') ? null : { time: Date.now(), url: 'https://app.test', auth: { localStorage: [], sessionStorage: [], cookies: [] }, errors: [], pusher: [] }) } };
  const store = createStore(api, { pageContextEnabled });
  return { api, store, har: value => harCallback(value) };
}
function request(overrides = {}) {
  return { startedDateTime: new Date().toISOString(), time: 12,
    request: { method: 'GET', url: 'https://api.test/data', headers: [] },
    response: { status: 200, headers: [], content: { mimeType: 'application/json', size: 10 } },
    getContent: cb => cb('{"ok":true}', ''), ...overrides };
}
test('page context is enabled by default and live requests include a nearby snapshot', t => {
  const h = harness(); t.after(() => h.store.close());
  assert.equal(h.store.pageContext, true);
  h.api.network.onRequestFinished.emit(request());
  assert.equal(h.store.entries[0].body, '{"ok":true}');
  assert.equal(h.store.entries[0].snapshot.url, 'https://app.test');
});
test('clear/navigation discard late response callbacks', t => {
  const h = harness(); t.after(() => h.store.close());
  let finish;
  h.api.network.onRequestFinished.emit(request({ getContent: cb => { finish = cb; } }));
  h.store.clear(); finish('old secret body', '');
  assert.equal(h.store.entries.length, 0);
  h.api.network.onRequestFinished.emit(request());
  h.api.network.onNavigated.emit('https://next.test');
  assert.equal(h.store.entries.length, 0); assert.equal(h.store.errors.length, 0);
});
test('pause ignores captures and resume captures again', t => {
  const h = harness(); t.after(() => h.store.close());
  h.store.togglePause(); h.api.network.onRequestFinished.emit(request()); assert.equal(h.store.entries.length, 0);
  h.store.togglePause(); h.api.network.onRequestFinished.emit(request()); assert.equal(h.store.entries.length, 1);
});
test('HAR bootstrap deduplicates overlap without losing identical live requests', t => {
  const h = harness({ deferredHAR: true }); t.after(() => h.store.close());
  const r = request(); h.api.network.onRequestFinished.emit(r); h.api.network.onRequestFinished.emit(r);
  h.har({ entries: [r, r] });
  assert.equal(h.store.entries.length, 2); assert.equal(h.store.entries[0].bodyState, 'ready');
});
test('late HAR after clearing does not resurrect data', t => {
  const h = harness({ deferredHAR: true }); t.after(() => h.store.close());
  h.store.clear(); h.har({ entries: [request()] }); assert.equal(h.store.entries.length, 0);
});
test('requests started before Clear cannot arrive afterward', t => {
  const h = harness(); t.after(() => h.store.close());
  const old = request({ startedDateTime: new Date(Date.now() - 10000).toISOString() });
  h.store.clear(); h.api.network.onRequestFinished.emit(old);
  assert.equal(h.store.entries.length, 0);
});
test('request ring is bounded and oversize/binary content is not retrieved', t => {
  const h = harness(); t.after(() => h.store.close());
  for (let i = 0; i < LIMITS.entries + 2; i++) h.api.network.onRequestFinished.emit(request());
  assert.equal(h.store.entries.length, LIMITS.entries); assert.equal(h.store.entries[0].id, 3);
  let called = false;
  h.api.network.onRequestFinished.emit(request({ response: { content: { mimeType: 'image/png', size: 123 } }, getContent: () => { called = true; } }));
  assert.equal(called, false); assert.equal(h.store.entries.at(-1).bodyState, 'omitted');
  h.api.network.onRequestFinished.emit(request({ response: { content: { mimeType: 'application/json', size: LIMITS.bodyCapture + 1 } }, getContent: () => { called = true; } }));
  assert.equal(called, false); assert.match(h.store.entries.at(-1).bodyNote, /256 KiB/);
});
test('base64 textual bodies decode Unicode without copying binary encodings', t => {
  const h = harness(); t.after(() => h.store.close());
  const body = '{"message":"živjo"}';
  h.api.network.onRequestFinished.emit(request({ getContent: cb => cb(Buffer.from(body).toString('base64'), 'base64') }));
  assert.equal(h.store.entries[0].body, body);
});
test('missing page access still captures HTTP', t => {
  const h = harness(); t.after(() => h.store.close());
  h.api.inspectedWindow.eval = (_expression, cb) => cb(null, { isException: true });
  h.store.clear(); h.api.network.onRequestFinished.emit(request());
  assert.equal(h.store.entries[0].bodyState, 'ready'); assert.equal(h.store.entries[0].snapshot, null);
});
test('explicit HTTP-only mode never evaluates page code, including clear, pause and close', () => {
  let evaluations = 0;
  const api = { network: { onRequestFinished: event(), onNavigated: event(), getHAR: cb => cb({ entries: [] }) },
    inspectedWindow: { eval: () => { evaluations++; } } };
  const store = createStore(api, { pageContextEnabled: false });
  assert.equal(store.pageContext, false);
  api.network.onRequestFinished.emit(request());
  assert.equal(store.entries.length, 1); assert.equal(store.entries[0].snapshot, null);
  assert.match(store.entries[0].note, /HTTP-only/);
  store.clear(); store.togglePause(); store.togglePause(); store.close();
  assert.equal(evaluations, 0);
});
test('disabling page context clears captured data and ignores an outstanding sample', t => {
  const h = harness({ pageContextEnabled: false }); t.after(() => h.store.close());
  let finish, stopped = 0;
  h.api.inspectedWindow.eval = (expression, cb) => {
    if (expression.endsWith(',"stop")')) { stopped++; cb(null); } else finish = cb;
  };
  h.store.setPageContext(true);
  h.api.network.onRequestFinished.emit(request());
  const generation = h.store.generation;
  h.store.setPageContext(false);
  finish({ time: Date.now(), url: 'https://app.test', auth: { localStorage: [{ key: 'token', value: 'synthetic-old-value' }] }, errors: [{ time: Date.now(), kind: 'error', message: 'late sample' }] });
  assert.equal(stopped, 1); assert.ok(h.store.generation > generation);
  assert.equal(h.store.snapshot, null); assert.equal(h.store.entries.length, 0); assert.equal(h.store.errors.length, 0);
  assert.match(h.store.status, /HTTP only/);
});
test('probe captures without getters, preserves console behavior, drains and cleans up', () => {
  const timers = new Map(), listeners = new Map(); let timerId = 0, consoleCalls = 0, getterCalls = 0;
  const original = () => { consoleCalls++; return 17; };
  const localStorage = { length: 1, key: () => 'auth_token', getItem: () => 'sample-token' };
  const sandbox = { console: { error: original }, document: { cookie: 'sid=sample-cookie' }, location: { href: 'https://app.test' }, localStorage,
    sessionStorage: { length: 0 },
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id),
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name),
    Pusher: { instances: [{ connection: { state: 'connected' }, channels: { channels: { 'private-demo': { subscribed: true } } } }] },
  };
  sandbox.window = sandbox; vm.createContext(sandbox);
  const key = 'a'.repeat(32), expression = probeExpression(key);
  const initial = vm.runInContext(expression, sandbox);
  assert.equal(initial.auth.localStorage[0].value, 'sample-token'); assert.equal(initial.pusher[0].channels[0].subscribed, true);
  const arg = {}; Object.defineProperty(arg, 'secret', { get() { getterCalls++; throw Error('do not call'); } });
  assert.equal(sandbox.console.error('failure', arg), 17);
  assert.equal(consoleCalls, 1); assert.equal(getterCalls, 0);
  const next = vm.runInContext(expression, sandbox);
  assert.equal(next.errors.length, 1); assert.match(next.errors[0].message, /getter not evaluated/);
  assert.equal(vm.runInContext(expression, sandbox).errors.length, 0);
  vm.runInContext(probeExpression(key, 'stop'), sandbox);
  assert.equal(sandbox.console.error, original); assert.equal(listeners.size, 0); assert.equal(timers.size, 0);
  assert.equal(Object.hasOwn(sandbox, '__request_context_' + key), false);
});
test('probe rejects captured-data interpolation and expires without a heartbeat', () => {
  assert.throws(() => probeExpression('evil); send(data)')); assert.throws(() => probeExpression('a'.repeat(32), 'arbitrary'));
  let expire;
  const original = () => {};
  const sandbox = { console: { error: original }, document: { cookie: '' }, location: { href: '' },
    setTimeout: fn => { expire = fn; return 1; }, clearTimeout: () => {}, addEventListener: () => {}, removeEventListener: () => {} };
  sandbox.window = sandbox; vm.createContext(sandbox);
  vm.runInContext(probeExpression('b'.repeat(32)), sandbox); expire();
  assert.equal(sandbox.console.error, original); assert.equal(Object.hasOwn(sandbox, '__request_context_' + 'b'.repeat(32)), false);
});
