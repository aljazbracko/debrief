import test from 'node:test';
import assert from 'node:assert/strict';
import { startDevtools } from '../devtools.js';

function setup(createCapture) {
  const events = new EventTarget();
  let show;
  const order = [];
  const api = { panels: { create: (title, icon, path, callback) => {
    order.push('panel');
    assert.equal(title, 'Debrief'); assert.equal(path, 'panel.html');
    callback({ onShown: { addListener: callback => { show = callback; } } });
  } } };
  startDevtools(api, () => { order.push('capture'); return createCapture(); }, events);
  assert.deepEqual(order, ['panel'], 'Opening DevTools alone must not start capture');
  const panel = new EventTarget(); let notified = false;
  panel.addEventListener('context-store-ready', () => { notified = true; });
  show(panel);
  return { events, order, panel, notified, show };
}
test('capture startup failure leaves a registered panel with recovery instructions', () => {
  const h = setup(() => { throw new Error('synthetic startup failure'); });
  assert.deepEqual(h.order, ['panel', 'capture']); assert.equal(h.notified, true);
  assert.match(h.panel.contextStore.status, /Capture could not start/);
  assert.deepEqual(h.panel.contextStore.entries, []);
});
test('successful capture connects to the panel and closes with DevTools', () => {
  let closed = false;
  const store = { close() { closed = true; } };
  const h = setup(() => store);
  assert.equal(h.panel.contextStore, store);
  h.show(h.panel);
  assert.deepEqual(h.order, ['panel', 'capture'], 'Reopening the panel must reuse the same capture');
  h.events.dispatchEvent(new Event('pagehide'));
  assert.equal(closed, true);
});
