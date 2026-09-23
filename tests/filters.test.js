import test from 'node:test';
import assert from 'node:assert/strict';
import { requestType, requestLabel, matchesFilters } from '../filters.js';

function entry(type = 'fetch', mime = 'application/json', status = 200, url = 'https://api.test/orders?region=eu') {
  return { resourceType: type, har: { request: { url, method: 'POST' }, response: { status, content: { mimeType: mime } } } };
}
test('request initiator types take priority over MIME fallback', () => {
  assert.equal(requestType(entry('fetch', 'image/png')), 'fetch');
  assert.equal(requestType(entry('xhr', 'text/html')), 'xhr');
  assert.equal(requestType(entry('document', 'application/json')), 'document');
  assert.equal(requestType(entry('script', 'text/plain')), 'assets');
  assert.equal(requestType(entry('font', 'application/octet-stream')), 'other');
});
test('HAR without a type gets an honest API candidate label, not an invented fetch type', () => {
  assert.equal(requestType(entry(undefined)), 'fetch');
  const e = entry(); delete e.resourceType;
  assert.equal(requestType(e), 'api');
  assert.ok(matchesFilters(e, { type: 'api' }));
  assert.ok(!matchesFilters(e, { type: 'fetch' }));
});
test('socket classification accepts reported type, ws URL, or upgrade status', () => {
  assert.equal(requestType(entry('websocket')), 'socket');
  assert.equal(requestType(entry('other', '', 101)), 'socket');
  assert.equal(requestType(entry('other', '', 200, 'wss://app.test/events')), 'socket');
  assert.equal(requestType(entry('xhr', 'application/json', 200, 'https://sockjs.pusher.test/poll')), 'xhr');
});
test('combined API filter includes fetch, XHR and fallback; exact filters stay exact', () => {
  for (const type of ['fetch', 'xhr']) assert.ok(matchesFilters(entry(type), { type: 'api' }));
  assert.ok(!matchesFilters(entry('image'), { type: 'api' }));
  assert.ok(!matchesFilters(entry('xhr'), { type: 'fetch' }));
});
test('method, status, host and positive/negative text combine with AND', () => {
  const e = entry('fetch', 'application/json', 422);
  const f = { type: 'api', method: 'POST', status: '4xx', host: 'api.test', query: 'orders eu -analytics' };
  assert.ok(matchesFilters(e, f));
  for (const bad of [{ method: 'GET' }, { status: '2xx' }, { host: 'other.test' }, { query: 'orders -eu' }]) assert.ok(!matchesFilters(e, { ...f, ...bad }));
  assert.ok(matchesFilters(e, { status: 'failed' }));
  assert.ok(matchesFilters(entry('fetch', '', 0), { status: 'network' }));
  assert.ok(!matchesFilters(entry(), { status: 'failed' }));
});
test('display and search never expose URL credentials or encoded emails', () => {
  const e = entry('fetch', '', 200, 'https://alice:password@api.test/orders?email=bob%40example.com&token=secret123');
  const label = requestLabel(e);
  assert.equal(label.host, 'api.test');
  assert.ok(label.name.startsWith('/orders'));
  for (const secret of ['alice', 'password', 'bob', 'secret123']) {
    assert.ok(!JSON.stringify(label).includes(secret)); assert.ok(!matchesFilters(e, { query: secret }));
  }
});
