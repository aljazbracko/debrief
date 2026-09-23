import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { browser, pause } from './browser.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
let egress = 0;
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/egress-check') egress++;
  if (path === '/api/order') {
    res.writeHead(422, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid quantity', email: 'demo@example.test', secret: 'demo-body-secret' }));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><title>Debrief synthetic test</title><h1>Synthetic app</h1>');
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let chrome;
try {
  chrome = await browser(['--auto-open-devtools-for-tabs', `--disable-extensions-except=${root}`, `--load-extension=${root}`]);
  const { send, attach, evaluate } = chrome;
  const target = await send('Target.createTarget', { url: origin });
  const app = await attach(target.targetId);
  for (let n = 0; n < 60; n++) { if (await evaluate(app, 'location.origin') === origin) break; await pause(100); }
  await pause(800);
  const hasProbe = `Object.getOwnPropertyNames(window).some(key => key.startsWith('__request_context_'))`;
  assert.equal(await evaluate(app, hasProbe), false, 'No probe before selecting Debrief');
  let panels = [];
  for (let n = 0; n < 40 && !panels.length; n++) {
    const targets = (await send('Target.getTargets')).targetInfos;
    for (const dt of targets.filter(t => t.url.startsWith('devtools://'))) {
      const session = await attach(dt.targetId);
      await evaluate(session, `import('./ui/legacy/legacy.js').then(m => { const v = m.InspectorView.InspectorView.instance(); const id = v.tabbedPane.tabIds().find(id => id.endsWith('Debrief')); return id ? v.showPanel(id) : null; })`);
    }
    await pause(200);
    panels = (await send('Target.getTargets')).targetInfos.filter(t => t.url.endsWith('/panel.html'));
  }
  assert.ok(panels.length, 'Extension panel did not load; use Chrome for Testing');
  const request = `fetch('/api/order?api_key=demo-query-secret', {method:'POST', headers:{Authorization:'Bearer demo-request-secret','Content-Type':'application/json'},body:JSON.stringify({password:'demo-payload-secret',quantity:0})})`;
  await evaluate(app, request); await pause(600);
  let panel;
  for (const target of panels) {
    const session = await attach(target.targetId);
    if (await evaluate(session, `Boolean(window.contextStore?.entries.some(e => e.har.request.url.startsWith(${JSON.stringify(origin)}) && e.har.request.url.includes('/api/order')))`)) { panel = session; break; }
  }
  assert.ok(panel, 'No captured synthetic request');
  assert.equal(await evaluate(panel, `contextStore.pageContext`), false);
  assert.equal(await evaluate(app, hasProbe), false, 'HTTP-only must never attach the probe');
  await evaluate(panel, `document.getElementById('http-only').click()`);
  assert.equal(await evaluate(panel, `contextStore.entries.length`), 0);
  await evaluate(app, `localStorage.setItem('auth_token','demo-storage-secret');window.pusher={connection:{state:'connected'},channels:{channels:{'private-orders':{subscribed:true}}}}`);
  await pause(1100);
  await evaluate(app, request + `.then(() => console.error('Order failed: demo-request-secret'))`);
  await pause(1100);
  const id = await evaluate(panel, `contextStore.entries.find(e=>e.har.request.url.includes('/api/order')).id`);
  await evaluate(panel, `document.querySelector('[data-id="${id}"] .request-status').click()`);
  const preview = await evaluate(panel, `document.getElementById('preview').textContent`);
  assert.match(preview, /Invalid quantity/); assert.match(preview, /Order failed/); assert.match(preview, /connected/);
  for (const secret of ['demo-request-secret', 'demo-query-secret', 'demo-body-secret', 'demo-payload-secret', 'demo-storage-secret', 'demo@example.test']) assert.ok(!preview.includes(secret));
  assert.equal(await evaluate(panel, `document.querySelector('#type-filters [aria-pressed=true]').dataset.type`), 'api');
  await evaluate(panel, `document.getElementById('tab-response').click()`);
  assert.match(await evaluate(panel, `document.getElementById('inspector').textContent`), /Invalid quantity/);
  await evaluate(panel, `document.execCommand=()=>{window.testCopied=document.activeElement.value;return true};document.getElementById('copy-selected').click()`);
  assert.equal(await evaluate(panel, 'window.testCopied'), preview);
  await evaluate(panel, `document.getElementById('copy-raw').click()`);
  assert.equal(await evaluate(panel, `document.getElementById('raw-confirm').disabled`), true);
  await evaluate(panel, `document.getElementById('raw-ack').click();document.getElementById('raw-confirm').click()`);
  assert.match(await evaluate(panel, 'window.testCopied'), /demo-request-secret/);
  await evaluate(panel, `document.getElementById('copy-selected').click()`);
  assert.equal(await evaluate(panel, 'window.testCopied'), preview);
  assert.equal(await evaluate(panel, `fetch(${JSON.stringify(origin + '/egress-check')}).then(()=>false,()=>true)`), true);
  assert.equal(egress, 0, 'Extension CSP must block the attempted test connection');
  await evaluate(panel, `document.getElementById('http-only').click()`);
  await pause(100);
  assert.equal(await evaluate(app, hasProbe), false);
  assert.equal(await evaluate(panel, 'contextStore.entries.length'), 0);
  assert.equal(await evaluate(panel, 'document.getElementById("copy-selected").disabled'), true);
  await evaluate(app, request); await pause(300);
  assert.equal(await evaluate(panel, 'contextStore.entries.at(-1).snapshot'), null);
  console.log('PASS: real extension loading, HTTP-only default, opt-in probe, capture, redaction, inspector, safe/raw copy, mode cleanup and CSP. Clipboard preserved.');
} finally {
  if (chrome) await chrome.close();
  await new Promise(resolve => server.close(resolve));
}
