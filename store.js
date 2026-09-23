import { LIMITS, isTextMime } from './format.js';
import { probeExpression } from './probe.js';

// All retained request data lives in this DevTools page's memory. No worker,
// storage API, content script, message port, or external recipient exists.
export function createStore(api, { pageContextEnabled = false } = {}) {
  const entries = [], errors = [], subscribers = new Set();
  const key = [...crypto.getRandomValues(new Uint8Array(16))].map(n => n.toString(16).padStart(2, '0')).join('');
  let nextId = 0, generation = 0, paused = false, snapshot = null, polling = false, closed = false, captureSince = 0;
  let probeStatus = 'Attaching page probe…', interval, bootstrap = true, pending = [];
  let pageContext = pageContextEnabled, probeEpoch = 0, probeAttached = false;
  const notify = () => { for (const fn of subscribers) fn(); };
  function evaluate(command, callback = () => {}) {
    if (command === 'stop' && !probeAttached) return callback(null, null);
    probeAttached = command === 'poll';
    try { api.inspectedWindow.eval(probeExpression(key, command), (result, exception) => callback(result, exception)); }
    catch { callback(null, true); }
  }
  function poll() {
    if (polling || paused || closed || !pageContext) return;
    polling = true;
    const epoch = generation, sampleEpoch = probeEpoch;
    const timeout = setTimeout(() => {
      if (sampleEpoch !== probeEpoch || epoch !== generation || closed) return;
      polling = false; probeStatus = 'Page probe not responding'; notify();
    }, 2500);
    evaluate('poll', (value, exception) => {
      clearTimeout(timeout);
      if (sampleEpoch !== probeEpoch || epoch !== generation || closed || paused || !pageContext) return;
      polling = false;
      if (exception || !value || typeof value !== 'object') {
        snapshot = null; probeStatus = 'HTTP capture active · page probe unavailable';
      } else {
        // Treat the page return as data only. Bound it before retaining it.
        try {
          if (JSON.stringify(value).length > 1048576) throw new Error('Oversized probe');
          const batch = Array.isArray(value.errors) ? value.errors : [];
          for (const e of batch.slice(-100)) {
            if (Number.isFinite(e.time) && typeof e.message === 'string' && typeof e.kind === 'string') {
              errors.push({ time: e.time, kind: e.kind.slice(0, 100), message: e.message.length <= 16384 ? e.message : '[OMITTED: large error]' });
            }
          }
          errors.splice(0, Math.max(0, errors.length - LIMITS.errors));
          snapshot = { time: value.time, url: value.url, auth: value.auth, pusher: value.pusher, note: value.note };
          probeStatus = 'Capturing · errors + auth sampled every second';
        } catch { snapshot = null; probeStatus = 'HTTP capture active · invalid page probe data'; }
      }
      notify();
    });
  }
  function add(request, historical = false) {
    if (paused || closed) return;
    if (captureSince && Date.parse(request.startedDateTime) < captureSince) return;
    let har;
    try {
      har = JSON.parse(JSON.stringify({ startedDateTime: request.startedDateTime, time: request.time,
        timings: request.timings, request: request.request, response: request.response }));
    } catch { return; }
    const notes = [];
    if (har.request?.postData && JSON.stringify(har.request.postData).length > LIMITS.bodyCapture) {
      har.request.postData = { text: '[OMITTED: request payload exceeds 256 KiB]', mimeType: 'text/plain' };
      notes.push('Request payload omitted: capture limit exceeded.');
    }
    if (har.response?.content) delete har.response.content.text;
    for (const part of [har.request, har.response]) {
      if (!part) continue;
      delete part.cookies; // The actual Cookie / Set-Cookie headers are retained.
      delete part.queryString; // Already present in the full URL.
      if (JSON.stringify(part.headers || []).length > LIMITS.metadataCapture) {
        part.headers = [{ name: 'Capture-note', value: 'Headers omitted: exceed 64 KiB' }];
      }
    }
    if (JSON.stringify(har).length > LIMITS.bodyCapture + LIMITS.metadataCapture * 2) return;
    const entry = { id: ++nextId, har, receivedAt: Date.now(), snapshot,
      resourceType: request._resourceType, body: '', bodyState: 'loading', note: notes.join(' ') };
    if (!pageContext) entry.note += ' HTTP-only mode: page storage, console errors and Pusher were not sampled.';
    if (request._initiator && JSON.stringify(request._initiator).length < 8000) entry.initiator = JSON.parse(JSON.stringify(request._initiator));
    if (historical) { entry.snapshot = null; entry.note += ' Historical HAR entry: no contemporaneous page snapshot.'; }
    entries.push(entry);
    if (entries.length > LIMITS.entries) entries.shift();
    const epoch = generation;
    const content = har.response?.content || {};
    const mime = content.mimeType || '';
    const finish = (body, encoding) => {
      if (epoch !== generation || !entries.includes(entry)) return;
      entry.bodyState = 'omitted';
      if (typeof body !== 'string') entry.bodyNote = 'Response body unavailable in Chrome (possibly evicted, redirected, or not retained).';
      else if (body.length > LIMITS.bodyCapture * 1.4) entry.bodyNote = 'Response body omitted: exceeds 256 KiB capture limit.';
      else {
        try {
          if (encoding === 'base64') {
            if (!isTextMime(mime)) throw new Error('binary');
            body = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(body), c => c.charCodeAt(0)));
          } else if (encoding) throw new Error('encoding');
          if (body.length > LIMITS.bodyCapture) entry.bodyNote = 'Response body omitted: exceeds 256 KiB capture limit.';
          else if (body && !isTextMime(mime)) entry.bodyNote = 'Response body omitted: binary or unknown MIME type.';
          else { entry.body = body; entry.bodyState = 'ready'; entry.bodyNote = ''; }
        } catch { entry.bodyNote = 'Response body omitted: binary or unsupported encoding.'; }
      }
      notify();
    };
    if (Number(content.size) > LIMITS.bodyCapture) { entry.bodyState = 'omitted'; entry.bodyNote = 'Response body omitted: exceeds 256 KiB capture limit.'; }
    else if (!isTextMime(mime) && Number(content.size) > 0) { entry.bodyState = 'omitted'; entry.bodyNote = 'Response body omitted: binary or unknown MIME type.'; }
    else if (typeof request.getContent === 'function') {
      const timeout = setTimeout(() => {
        if (epoch === generation && entries.includes(entry) && entry.bodyState === 'loading') {
          entry.bodyState = 'unavailable'; entry.bodyNote = 'Chrome did not return the response body within 5 seconds.'; notify();
        }
      }, 5000);
      try { request.getContent((body, encoding) => { clearTimeout(timeout); finish(body, encoding); }); }
      catch { clearTimeout(timeout); finish(undefined); }
    } else finish(request.response?.content?.text, request.response?.content?.encoding);
    notify();
  }
  const fingerprint = r => JSON.stringify([r.startedDateTime, r.request?.method, r.request?.url, r.time, r.response?.status]);
  const onRequest = request => { if (bootstrap) pending.push(request); else add(request); };
  const clear = () => {
    generation++; probeEpoch++; polling = false; captureSince = Date.now(); entries.length = 0; errors.length = 0; snapshot = null; pending = []; bootstrap = false;
    evaluate('stop'); notify(); if (!paused) poll();
  };
  const onNavigated = () => { clear(); };
  api.network.onRequestFinished.addListener(onRequest);
  api.network.onNavigated.addListener(onNavigated);
  const initialEpoch = generation;
  const bootstrapTimer = setTimeout(() => {
    if (!bootstrap) return;
    bootstrap = false; for (const request of pending) add(request); pending = [];
  }, 3000);
  api.network.getHAR(har => {
    if (!bootstrap || initialEpoch !== generation || closed) return;
    clearTimeout(bootstrapTimer);
    // Prefer live Request objects: they supply getContent(). Preserve repeated
    // identical requests by matching occurrence counts, not a global URL set.
    const remaining = new Map();
    for (const r of pending) { const f = fingerprint(r); remaining.set(f, (remaining.get(f) || 0) + 1); }
    for (const r of (har?.entries || []).slice(-LIMITS.entries)) {
      const f = fingerprint(r), count = remaining.get(f) || 0;
      if (count) remaining.set(f, count - 1); else add(r, true);
    }
    bootstrap = false; for (const r of pending) add(r); pending = [];
  });
  poll(); interval = setInterval(poll, 1000);
  return {
    entries, errors,
    get generation() { return generation; },
    get snapshot() { return snapshot; },
    get paused() { return paused; },
    get pageContext() { return pageContext; },
    get status() { return paused ? 'Paused · new requests and page data are not captured' : pageContext ? probeStatus : 'HTTP only · page probe disabled'; },
    subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
    clear,
    togglePause() { paused = !paused; if (paused) { probeEpoch++; polling = false; snapshot = null; evaluate('stop'); } else poll(); notify(); },
    setPageContext(enabled) {
      if (closed || pageContext === Boolean(enabled)) return;
      pageContext = Boolean(enabled);
      // Clear all retained samples and selections on a mode change, including
      // outstanding callbacks; HTTP headers may still contain credentials.
      clear();
    },
    close() {
      closed = true; generation++; clearInterval(interval); clearTimeout(bootstrapTimer); evaluate('stop');
      entries.length = 0; errors.length = 0; snapshot = null; pending = []; subscribers.clear();
      api.network.onRequestFinished.removeListener(onRequest); api.network.onNavigated.removeListener(onNavigated);
    },
  };
}
