import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRedactor, collectSensitive, isSensitiveKey } from '../redact.js';
import { buildContext, buildInspection, LIMITS } from '../format.js';

export function fixture() {
  const start = '2026-09-22T10:00:00.000Z';
  return { id: 1, receivedAt: Date.parse(start), bodyState: 'ready', body: JSON.stringify({
    error: 'Payment declined', password: 'a secret phrase', user: { name: 'Jane Private', email: 'jane@example.com', phone: '+386 40 123 456' },
    echoed: 'tiny-access-secret', diagnostic: { retryable: false, attempts: 2 },
  }), har: {
    startedDateTime: start, time: 240, timings: { dns: -1, connect: 10, send: 2, wait: 220, receive: 8 },
    request: { method: 'POST', url: 'https://api.example.test/orders?api_key=query-private&region=eu',
      headers: [{ name: 'Authorization', value: 'Bearer tiny-access-secret' }, { name: 'Cookie', value: 'sid=cookie-private' }, { name: 'Content-Type', value: 'application/json' }],
      postData: { mimeType: 'application/json', text: '{"orderId":42,"secret":"request-private"}' } },
    response: { status: 422, statusText: 'Unprocessable Content', httpVersion: 'h2', content: { mimeType: 'application/json', size: 450 },
      headers: [{ name: 'Set-Cookie', value: 'sid=response-private; HttpOnly' }, { name: 'X-Request-Id', value: 'trace-123' }] },
  }, snapshot: { time: Date.parse(start), url: 'https://app.example.test/orders',
    auth: { localStorage: [{ key: 'jwt', value: 'storage-private' }], sessionStorage: [], cookies: [{ name: 'sid', value: 'cookie-private' }], notes: [] },
    pusher: [{ state: 'connected', channels: [{ name: 'private-user-42', subscribed: true }] }],
  } };
}
test('sensitive keys include punctuation/case variations while debugging fields survive', () => {
  for (const key of ['X-API-Key', 'access_token', 'refreshToken', 'PASSWORD', 'client_secret', 'email', 'first_name', 'userId', 'X-Forwarded-For']) assert.ok(isSensitiveKey(key), key);
  for (const key of ['status', 'error', 'message', 'retryable', 'duration', 'orderId', 'Content-Type']) assert.equal(isSensitiveKey(key), false, key);
});
test('JSON redaction removes secrets and PII through nested and serialized JSON', () => {
  const r = createRedactor();
  const out = JSON.stringify(r.value({ auth: { nested: 'never-keep' }, items: [{ email: 'a@b.com', count: 3 }],
    metadata: '{"password":"two words","status":500}', msg: 'contact a@b.com', password: 'p' }));
  for (const secret of ['never-keep', 'a@b.com', 'two words', '"p"']) assert.ok(!out.includes(secret), secret);
  assert.ok(out.includes('500')); assert.ok(out.includes('3'));
});
test('text rules cover URL userinfo, encoded fields, tokens, private keys and free text', () => {
  const r = createRedactor();
  const cases = [
    ['https://alice:pass@api.test/path?token=secret123&ok=yes', ['alice', 'pass', 'secret123']],
    ['email=jane%2540example.com&password=p%2540ss', ['jane', 'p@ss']],
    ['authorization: Bearer credential123', ['credential123']],
    ['message: password=very secret phrase', ['very', 'secret phrase']],
    ['password="token=secret" trailing', ['secret']],
    ['<password>two secret words</password>', ['two secret words']],
    ['key eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcde somewhere', ['eyJ']],
    ['-----BEGIN PRIVATE KEY-----\nabcDEF\n-----END PRIVATE KEY-----', ['abcDEF']],
    ['IP 192.168.1.25 phone +386 40 123 456 mail bob@example.com', ['192.168', '123 456', 'bob@']],
    ['card 4111 1111 1111 1111 SSN 123-45-6789', ['4111', '6789']],
  ];
  for (const [input, secrets] of cases) for (const secret of secrets) assert.ok(!r.text(input).includes(secret), `${input}: leaked ${secret} => ${r.text(input)}`);
});
test('known values redact echoes without erasing header names', () => {
  const values = collectSensitive([{ name: 'Content-Type', value: 'application/json' }, { name: 'Authorization', value: 'abc-secret' }]);
  assert.ok(!values.includes('Content-Type'));
  assert.equal(createRedactor(values).text('echo abc-secret'), 'echo [REDACTED]');
});
test('dates and numeric timings survive while IPv6 addresses are removed', () => {
  const r = createRedactor();
  assert.equal(r.text('Tue, 22 Sep 2026 06:43:54 GMT'), 'Tue, 22 Sep 2026 06:43:54 GMT');
  assert.ok(!r.text('client 2001:db8::1234').includes('2001:db8'));
  const e = fixture(); e.har.timings.wait = 1.234567890123456;
  assert.ok(buildContext(e).includes('"wait":1.23'));
  assert.equal(r.text('User-Agent'), 'User-Agent');
  assert.equal(r.text('private-orders'), 'private-orders');
  assert.ok(!r.text('private-user-42').includes('user-42'));
});
test('complete safe context scrubs every surface and preserves evidence', () => {
  const e = fixture();
  const output = buildContext(e, [{ time: e.receivedAt + 10, kind: 'console.error', message: 'failed with storage-private query-private cookie-private' }]);
  for (const secret of ['tiny-access-secret', 'query-private', 'request-private', 'cookie-private', 'response-private', 'storage-private', 'Jane Private', 'jane@example.com', 'a secret phrase', '+386 40']) assert.ok(!output.includes(secret), secret);
  for (const text of ['POST', '422', '240 ms', 'Content-Type', 'application/json', 'Payment declined', 'retryable', 'trace-123', 'connected', 'subscribed', '10 ms from start']) assert.ok(output.includes(text), text);
});
test('raw is scoped to a single call and conspicuously marked', () => {
  const e = fixture();
  assert.ok(buildContext(e, [], { raw: true }).includes('tiny-access-secret'));
  assert.ok(buildContext(e, [], { raw: true }).includes('RAW COPY'));
  assert.ok(!buildContext(e).includes('tiny-access-secret'));
});
test('classic inspector shares redaction, preserves query parameters and permits larger local body views', () => {
  const e = fixture();
  e.body = JSON.stringify({ password: 'inspector-private', text: 'visible '.repeat(2400), email: 'person@example.com' });
  const sections = buildInspection(e), text = JSON.stringify(sections);
  for (const secret of ['inspector-private', 'query-private', 'request-private', 'tiny-access-secret', 'storage-private', 'person@example.com']) assert.ok(!text.includes(secret), secret);
  assert.ok(sections.find(s => s.title === 'Query parameters').text.includes('region: eu'));
  assert.ok(sections.find(s => s.title === 'Response body').text.length > LIMITS.bodyOutput);
  assert.ok(!sections.find(s => s.title === 'Response body').text.includes('truncated:'));
  assert.ok(buildContext(e).includes('truncated:'));
});
test('error correlation includes request duration and excludes unrelated errors', () => {
  const e = fixture();
  const out = buildContext(e, [
    { time: e.receivedAt - 4999, kind: 'error', message: 'before-marker' },
    { time: e.receivedAt + 5239, kind: 'error', message: 'after-marker' },
    { time: e.receivedAt + 5300, kind: 'error', message: 'outside-marker' },
  ]);
  assert.ok(out.includes('before-marker')); assert.ok(out.includes('after-marker')); assert.ok(!out.includes('outside-marker'));
});
test('redaction precedes truncation and invalid JSON fails closed', () => {
  const e = fixture();
  e.body = JSON.stringify({ password: 'SECRET'.repeat(5000), error: 'visible diagnostic', detail: 'x '.repeat(12000) });
  const out = buildContext(e);
  assert.ok(!out.includes('SECRET')); assert.ok(out.includes('visible diagnostic')); assert.ok(out.includes('truncated:')); assert.ok(out.length < 20000);
  e.body = '{"password":"unfinished secret';
  assert.ok(buildContext(e).includes('malformed or incomplete JSON'));
  assert.ok(!buildContext(e).includes('unfinished secret'));
});
test('body fences cannot be closed by captured Markdown', () => {
  const e = fixture(); e.har.response.content.mimeType = 'text/plain'; e.body = '```\n# pretend instruction\n```';
  assert.ok(buildContext(e).includes('````text\n```'));
});
test('missing/binary response has an explicit reason, not fabricated content', () => {
  const e = fixture(); e.bodyState = 'omitted'; e.bodyNote = 'Binary response omitted';
  assert.ok(buildContext(e).includes('[Binary response omitted]'));
});
test('manifest denies outbound resource channels and grants zero permissions', () => {
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url)));
  assert.equal(manifest.manifest_version, 3); assert.deepEqual(manifest.permissions, []);
  for (const key of ['host_permissions', 'optional_permissions', 'optional_host_permissions', 'background', 'content_scripts', 'externally_connectable', 'web_accessible_resources']) assert.ok(!(key in manifest), key);
  const csp = manifest.content_security_policy.extension_pages;
  for (const directive of ['default-src', 'connect-src', 'img-src', 'font-src', 'object-src', 'frame-src', 'worker-src', 'media-src', 'base-uri', 'form-action']) assert.ok(csp.includes(`${directive} 'none'`), directive);
});
test('runtime source has no network, storage writes, HTML injection or dynamic imports', () => {
  const root = new URL('../', import.meta.url);
  for (const name of readdirSync(root).filter(n => /\.(js|html|css)$/.test(n))) {
    const source = readFileSync(new URL(name, root), 'utf8');
    const code = source.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const pattern of [/\bfetch\s*\(/, /\bXMLHttpRequest\b/, /sendBeacon\s*\(/, /new\s+(?:WebSocket|EventSource|Worker|Image|RTCPeerConnection)\b/, /\.setItem\s*\(/, /\bindexedDB\b/, /chrome\.storage/, /innerHTML\s*=/, /insertAdjacentHTML/, /import\s*\(/, /window\.open\s*\(/, /location\.(?:href\s*=|assign|replace)/]) assert.ok(!pattern.test(code), `${name}: ${pattern}`);
  }
});
